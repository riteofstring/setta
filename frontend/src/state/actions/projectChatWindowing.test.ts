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
  getProjectChatWindowModeForSectionInState,
  getVisibleProjectChatWindowInstances,
  maximizeProjectChatWindowInState,
  moveProjectChatWindowToCanvasSectionInState,
  reopenProjectChatWindowInState,
  setProjectChatWindowBoundsInState,
  setProjectChatWindowDockFractionsInState,
  setProjectChatWindowModeForSectionInState,
  setProjectChatWindowPlacementInState,
  undockProjectChatWindowFromCanvasSectionInState,
  unmaximizeProjectChatWindowInState,
} from "./projectChatWindowing";

describe("project chat windowing reducer helpers", () => {
  it("creates an open bottom-docked chat window instance", () => {
    // New instances must be visible and docked by default.
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

  it("treats close as hide and allows reopen", () => {
    // Close must preserve window identity and be reversible through reopen.
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
    expect(closedInstance.isMinimized).toBe(true);

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

  it("returns only visible windows in normalized order", () => {
    // Visibility list should ignore closed windows and normalize duplicate order ids.
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
      isClosed: false,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [first.instanceId]: first,
        [second.instanceId]: second,
        [third.instanceId]: third,
      },
      order: [first.instanceId, first.instanceId, second.instanceId],
      nextInstanceNumber: 4,
    });

    const visible = getVisibleProjectChatWindowInstances(initial);

    expect(visible.map((instance) => instance.instanceId)).toEqual([
      first.instanceId,
      third.instanceId,
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

  it("moves a chat window to canvas placement and reopens it", () => {
    // Booting to canvas should bind the section id and make the window visible/focused.
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
    expect(updated.mode).toBe(ChatWindowModeEnum.project_ai_mode);
    expect(updated.isClosed).toBe(false);
    expect(updated.isMinimized).toBe(false);
    expect(updated.zIndex).toBe(4);
    expect(updated.lastFocusedAt).toBe(4321);
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
});
