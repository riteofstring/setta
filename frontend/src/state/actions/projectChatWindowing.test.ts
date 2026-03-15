import { buildProjectChatEphemeralWindowInstanceKey } from "state/actions/projectChatWindowingEphemeral";
import {
  NULL_PROJECT_CONFIG_ID,
  useAIStore,
  useProjectState,
} from "state/definitions";
import { useMisc } from "state/stores/layoutInteractionStores";
import { useSettings } from "state/stores/uiPreferenceStores";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
  createSettingsState,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoistedProjectChatWindowing = vi.hoisted(() => ({
  createTopLevelSectionWithResult: vi.fn(),
  routeSetProjectChatWindowingState: vi.fn(),
  routeSetProjectChatWindowChatId: vi.fn(),
}));

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: {
    getState: () => ({
      transform: [0, 0, 1],
      d3Zoom: null,
      d3Selection: null,
      domNode: null,
    }),
  },
}));

vi.mock("./sections/createSections", () => ({
  createTopLevelSectionWithResult:
    hoistedProjectChatWindowing.createTopLevelSectionWithResult,
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_set_project_chat_windowing_state: (...args: unknown[]) =>
    hoistedProjectChatWindowing.routeSetProjectChatWindowingState(...args),
  route_set_project_chat_window_chat_id: (...args: unknown[]) =>
    hoistedProjectChatWindowing.routeSetProjectChatWindowChatId(...args),
}));

import {
  closeProjectChatWindow,
  setProjectChatWindowBounds,
  setProjectChatWindowChatId,
  unmaximizeProjectChatWindow,
} from "./projectChatWindowing";
import {
  setProjectChatWindowBoundsByIdInState,
  setProjectChatWindowBoundsInState,
  setProjectChatWindowDockFractionsInState,
} from "./projectChatWindowingBoundsState";
import { bootProjectChatWindowToCanvasSection } from "./projectChatWindowingCanvasBoot";
import { addProjectChatWindowInstanceInState } from "./projectChatWindowingInstanceState";
import {
  closeProjectChatWindowInState,
  focusProjectChatWindowInState,
  maximizeProjectChatWindowInState,
  minimizeProjectChatWindowInState,
  reopenProjectChatWindowInState,
  setProjectChatWindowPlacementInState,
  unmaximizeProjectChatWindowInState,
} from "./projectChatWindowingPlacementState";
import {
  getExternalProjectChatWindowBindingForSectionInState,
  getOpenExternalProjectChatWindowInstanceForSectionInState,
  getProjectChatWindowBindingForSectionInState,
  getProjectChatWindowModeForSectionInState,
  getVisibleProjectChatWindowInstances,
  resolveDefaultDockedChatHeightPx,
  resolveDefaultFloatingChatBounds,
} from "./projectChatWindowingSelectors";
import {
  moveProjectChatWindowToCanvasSectionInState,
  setProjectChatWindowModeForSectionInState,
  setProjectChatWindowTitleInState,
  showSectionInProjectChatWindowInState,
  undockProjectChatWindowFromCanvasSectionInState,
} from "./projectChatWindowingState";
import { ensureTrackedGitPaneGraphWindow } from "./projectChatWindowingTrackedGitPane";
import {
  flushPendingProjectChatWindowingWrites,
  syncProjectChatWindowingState,
} from "./projectChatWindowingWrites";

describe("project chat windowing reducer helpers", () => {
  beforeEach(() => {
    resetProjectStores();
    useAIStore.setState({ activeChatId: undefined });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
    hoistedProjectChatWindowing.createTopLevelSectionWithResult.mockReset();
    hoistedProjectChatWindowing.routeSetProjectChatWindowingState.mockReset();
    hoistedProjectChatWindowing.routeSetProjectChatWindowingState.mockImplementation(
      async (request: {
        state: ReturnType<typeof createProjectChatWindowingState>;
      }) => ({
        data: request.state,
        status: 200,
        hasResponse: true,
      }),
    );
    hoistedProjectChatWindowing.routeSetProjectChatWindowChatId.mockReset();
    hoistedProjectChatWindowing.routeSetProjectChatWindowChatId.mockImplementation(
      async () => ({
        data: useProjectState.getState().projectChatWindowing,
        status: 200,
        hasResponse: true,
      }),
    );
  });

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

  it("resolves default floating chat bounds in the center at seventy percent viewport height", () => {
    // Explicit floating windows should open centered within the floating work area.
    const bounds = resolveDefaultFloatingChatBounds({
      viewportWidthPx: 1440,
      viewportHeightPx: 900,
      workspaceTopInsetPx: 40,
      bottomInsetPx: 0,
    });

    expect(bounds).toEqual({
      x: 310,
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

  it("falls back to bottom-docked placement when restorePriorStateOnUnmaximize is disabled", () => {
    const baseInstance = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      placement: ChatWindowPlacementEnum.maximized,
      isMaximized: true,
      lastPlacementBeforeMaximize: ChatWindowPlacementEnum.floating,
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

    const restored = unmaximizeProjectChatWindowInState(
      initial,
      baseInstance.instanceId,
      false,
    );

    expect(restored.instancesById[baseInstance.instanceId]).toMatchObject({
      isMaximized: false,
      placement: ChatWindowPlacementEnum.bottom_docked,
      lastPlacementBeforeMaximize: null,
      bounds: {
        x: 240,
        y: 180,
        width: 900,
        height: 560,
      },
    });
  });

  it("reuses the tracked git pane graph window until it leaves the pane-following state", () => {
    const firstInstanceId = ensureTrackedGitPaneGraphWindow();
    const firstWindowing = useProjectState.getState().projectChatWindowing;
    expect(Object.keys(firstWindowing.instancesById)).toHaveLength(1);
    expect(
      useMisc.getState().projectChatTrackedGitPaneGraphWindowInstanceId,
    ).toBe(
      buildProjectChatEphemeralWindowInstanceKey("project-1", firstInstanceId),
    );
    expect(firstWindowing.instancesById[firstInstanceId]?.placement).toBe(
      ChatWindowPlacementEnum.maximized,
    );

    const reusedInstanceId = ensureTrackedGitPaneGraphWindow();
    const reusedWindowing = useProjectState.getState().projectChatWindowing;
    expect(reusedInstanceId).toBe(firstInstanceId);
    expect(Object.keys(reusedWindowing.instancesById)).toHaveLength(1);

    unmaximizeProjectChatWindow(firstInstanceId);
    expect(
      useMisc.getState().projectChatTrackedGitPaneGraphWindowInstanceId,
    ).toBeNull();

    const secondInstanceId = ensureTrackedGitPaneGraphWindow();
    const secondWindowing = useProjectState.getState().projectChatWindowing;
    expect(secondInstanceId).not.toBe(firstInstanceId);
    expect(Object.keys(secondWindowing.instancesById)).toHaveLength(2);
    expect(secondWindowing.instancesById[secondInstanceId]?.placement).toBe(
      ChatWindowPlacementEnum.maximized,
    );
    expect(
      useMisc.getState().projectChatTrackedGitPaneGraphWindowInstanceId,
    ).toBe(
      buildProjectChatEphemeralWindowInstanceKey("project-1", secondInstanceId),
    );
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

  it("clears embedded git-pane visibility when a graph window closes", () => {
    useProjectState.setState({
      projectChatWindowing: createProjectChatWindowingState({
        order: ["graph-window-1"],
        instancesById: {
          "graph-window-1": createProjectChatWindowInstance({
            instanceId: "graph-window-1",
            mode: ChatWindowModeEnum.git_graph_mode,
          }),
        },
      }),
    });
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-1",
          "graph-window-1",
        )]: true,
      },
    });

    closeProjectChatWindow("graph-window-1");

    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({});
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

  it("refreshes focus time without changing z-index for the unique topmost window", () => {
    const topmost = createProjectChatWindowInstance({
      instanceId: "chat-window-top",
      zIndex: 3,
      lastFocusedAt: 1111,
    });
    const background = createProjectChatWindowInstance({
      instanceId: "chat-window-background",
      zIndex: 2,
      lastFocusedAt: 1000,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [topmost.instanceId]: topmost,
        [background.instanceId]: background,
      },
      order: [background.instanceId, topmost.instanceId],
      nextInstanceNumber: 3,
    });

    const focused = focusProjectChatWindowInState(
      initial,
      topmost.instanceId,
      2222,
    );

    expect(focused.instancesById[topmost.instanceId]).toMatchObject({
      zIndex: 3,
      lastFocusedAt: 2222,
    });
  });

  it("breaks top-layer ties before focusing a window", () => {
    const target = createProjectChatWindowInstance({
      instanceId: "chat-window-target",
      zIndex: 7,
      lastFocusedAt: 1000,
    });
    const currentWinner = createProjectChatWindowInstance({
      instanceId: "chat-window-winner",
      zIndex: 7,
      lastFocusedAt: 2000,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [target.instanceId]: target,
        [currentWinner.instanceId]: currentWinner,
      },
      order: [target.instanceId, currentWinner.instanceId],
      nextInstanceNumber: 3,
    });

    const focused = focusProjectChatWindowInState(
      initial,
      target.instanceId,
      2222,
    );

    expect(focused.instancesById[target.instanceId]).toMatchObject({
      zIndex: 3,
      lastFocusedAt: 2222,
    });
    expect(focused.instancesById[currentWinner.instanceId]?.zIndex).toBe(2);
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

  it("drops custom titles for section-backed windows", () => {
    const baseInstance = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      sectionIdOrNull: "section-1",
      title: "Old Section Title",
    });
    const initial = createProjectChatWindowingState({
      instancesById: { [baseInstance.instanceId]: baseInstance },
      order: [baseInstance.instanceId],
      nextInstanceNumber: 2,
    });

    const next = setProjectChatWindowTitleInState(
      initial,
      baseInstance.instanceId,
      "Ignored Title",
    );

    expect(next.instancesById[baseInstance.instanceId]?.title).toBeNull();
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

  it("keeps git graph windows out of canvas state", () => {
    const target = createProjectChatWindowInstance({
      instanceId: "chat-window-a",
      placement: ChatWindowPlacementEnum.maximized,
      isClosed: true,
      isMinimized: true,
      mode: ChatWindowModeEnum.git_graph_mode,
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
        nowMs: 2468,
        mode: ChatWindowModeEnum.git_graph_mode,
      },
    );

    expect(next).toBe(initial);
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

  it("matches backend normalization for exact duplicate section-binding ties", () => {
    const lowerId = createProjectChatWindowInstance({
      instanceId: "project-chat-window-1",
      placement: ChatWindowPlacementEnum.floating,
      sectionIdOrNull: "section-1",
      isClosed: false,
      isMinimized: false,
      zIndex: 7,
      lastFocusedAt: 100,
    });
    const higherId = createProjectChatWindowInstance({
      instanceId: "project-chat-window-2",
      placement: ChatWindowPlacementEnum.floating,
      sectionIdOrNull: "section-1",
      isClosed: false,
      isMinimized: false,
      zIndex: 7,
      lastFocusedAt: 100,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [lowerId.instanceId]: lowerId,
        [higherId.instanceId]: higherId,
      },
      order: [lowerId.instanceId, higherId.instanceId],
      nextInstanceNumber: 3,
    });

    expect(
      getProjectChatWindowBindingForSectionInState(initial, "section-1")
        ?.instanceId,
    ).toBe(higherId.instanceId);
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

  it("creates a canvas binding when switching an unbound section into project-ai mode", () => {
    const initial = createProjectChatWindowingState();

    const next = setProjectChatWindowModeForSectionInState(
      initial,
      "section-1",
      ChatWindowModeEnum.project_ai_mode,
    );

    expect(next).not.toBe(initial);
    expect(next.order).toHaveLength(1);
    const created = next.instancesById[next.order[0] ?? ""];
    if (!created) {
      throw new Error(
        "Expected created canvas binding for section mode switch.",
      );
    }
    expect(created.sectionIdOrNull).toBe("section-1");
    expect(created.placement).toBe(ChatWindowPlacementEnum.canvas_section);
    expect(created.mode).toBe(ChatWindowModeEnum.project_ai_mode);
  });

  it("keeps section mode implicit when no binding exists yet", () => {
    const initial = createProjectChatWindowingState();

    const next = setProjectChatWindowModeForSectionInState(
      initial,
      "missing-section",
      ChatWindowModeEnum.section_mode,
    );

    expect(next).toBe(initial);
  });

  it("clears live window-owned chat ids when a bound section window switches to section mode", () => {
    const sectionWindow = createProjectChatWindowInstance({
      instanceId: "section-window-1",
      placement: ChatWindowPlacementEnum.floating,
      mode: ChatWindowModeEnum.project_ai_mode,
      sectionIdOrNull: "section-1",
      chatId: "window-thread",
    });
    const initial = createProjectChatWindowingState({
      order: [sectionWindow.instanceId],
      instancesById: {
        [sectionWindow.instanceId]: sectionWindow,
      },
      nextInstanceNumber: 2,
    });

    const next = setProjectChatWindowModeForSectionInState(
      initial,
      "section-1",
      ChatWindowModeEnum.section_mode,
    );

    expect(next.instancesById[sectionWindow.instanceId]).toMatchObject({
      mode: ChatWindowModeEnum.section_mode,
      chatId: null,
    });
  });

  it("keeps section-backed project-ai threads out of the global active project chat", () => {
    const sectionWindow = createProjectChatWindowInstance({
      instanceId: "chat-window-section",
      mode: ChatWindowModeEnum.project_ai_mode,
      sectionIdOrNull: "section-1",
    });
    useProjectState.setState((state) => {
      state.projectConfig.id = NULL_PROJECT_CONFIG_ID;
      state.projectChatWindowing = createProjectChatWindowingState({
        instancesById: {
          [sectionWindow.instanceId]: sectionWindow,
        },
        order: [sectionWindow.instanceId],
        nextInstanceNumber: 2,
      });
    });
    useAIStore.setState({ activeChatId: "global-chat" });

    setProjectChatWindowChatId(sectionWindow.instanceId, "section-chat");

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        sectionWindow.instanceId
      ]?.chatId,
    ).toBe("section-chat");
    expect(useAIStore.getState().activeChatId).toBe("global-chat");
  });

  it("ignores window chat-id writes for section-mode windows", async () => {
    const sectionWindow = createProjectChatWindowInstance({
      instanceId: "chat-window-section-mode",
      mode: ChatWindowModeEnum.section_mode,
      sectionIdOrNull: "section-1",
      chatId: null,
    });
    useProjectState.setState((state) => {
      state.projectChatWindowing = createProjectChatWindowingState({
        instancesById: {
          [sectionWindow.instanceId]: sectionWindow,
        },
        order: [sectionWindow.instanceId],
        nextInstanceNumber: 2,
      });
    });

    setProjectChatWindowChatId(sectionWindow.instanceId, "section-chat");
    await flushPendingProjectChatWindowingWrites();

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        sectionWindow.instanceId
      ]?.chatId,
    ).toBeNull();
    expect(
      hoistedProjectChatWindowing.routeSetProjectChatWindowChatId,
    ).not.toHaveBeenCalled();
  });

  it("ignores window chat-id writes for git-graph windows", async () => {
    const gitGraphWindow = createProjectChatWindowInstance({
      instanceId: "chat-window-git-graph",
      mode: ChatWindowModeEnum.git_graph_mode,
      chatId: null,
    });
    useProjectState.setState((state) => {
      state.projectChatWindowing = createProjectChatWindowingState({
        instancesById: {
          [gitGraphWindow.instanceId]: gitGraphWindow,
        },
        order: [gitGraphWindow.instanceId],
        nextInstanceNumber: 2,
      });
    });

    setProjectChatWindowChatId(gitGraphWindow.instanceId, "git-thread");
    await flushPendingProjectChatWindowingWrites();

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        gitGraphWindow.instanceId
      ]?.chatId,
    ).toBeNull();
    expect(
      hoistedProjectChatWindowing.routeSetProjectChatWindowChatId,
    ).not.toHaveBeenCalled();
  });

  it("syncs the current project chat windowing snapshot through the write coordinator", async () => {
    // Full windowing syncs should send the current snapshot through the
    // serialized write path instead of rebuilding a second persistence flow.
    const syncedWindow = createProjectChatWindowInstance({
      instanceId: "chat-window-sync",
      mode: ChatWindowModeEnum.project_ai_mode,
      sectionIdOrNull: null,
      chatId: "chat-sync",
      zIndex: 4,
    });
    const currentWindowing = createProjectChatWindowingState({
      instancesById: {
        [syncedWindow.instanceId]: syncedWindow,
      },
      order: [syncedWindow.instanceId],
      nextInstanceNumber: 2,
    });
    useProjectState.setState((state) => {
      state.projectChatWindowing = currentWindowing;
    });

    const response = await syncProjectChatWindowingState();

    expect(response?.data).toEqual(currentWindowing);
    expect(
      hoistedProjectChatWindowing.routeSetProjectChatWindowingState,
    ).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      state: currentWindowing,
      frontendOpId: expect.any(String),
    });
  });

  it("updates the global active project chat for unscoped project-ai windows", () => {
    const projectWindow = createProjectChatWindowInstance({
      instanceId: "chat-window-project",
      mode: ChatWindowModeEnum.project_ai_mode,
      sectionIdOrNull: null,
    });
    useProjectState.setState((state) => {
      state.projectConfig.id = NULL_PROJECT_CONFIG_ID;
      state.projectChatWindowing = createProjectChatWindowingState({
        instancesById: {
          [projectWindow.instanceId]: projectWindow,
        },
        order: [projectWindow.instanceId],
        nextInstanceNumber: 2,
      });
    });
    useAIStore.setState({ activeChatId: "global-chat" });

    setProjectChatWindowChatId(projectWindow.instanceId, "project-chat");

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        projectWindow.instanceId
      ]?.chatId,
    ).toBe("project-chat");
    expect(useAIStore.getState().activeChatId).toBe("project-chat");
  });

  it("reads restorePriorStateOnUnmaximize from settings when unmaximizing a live window", async () => {
    const baseInstance = createProjectChatWindowInstance({
      instanceId: "chat-window-settings",
      placement: ChatWindowPlacementEnum.maximized,
      isMaximized: true,
      lastPlacementBeforeMaximize: ChatWindowPlacementEnum.floating,
      bounds: {
        x: 240,
        y: 180,
        width: 900,
        height: 560,
      },
    });
    useSettings.setState(
      createSettingsState({
        chatWindowing: {
          restorePriorStateOnUnmaximize: false,
        },
      }),
    );
    useProjectState.setState((state) => {
      state.projectChatWindowing = createProjectChatWindowingState({
        instancesById: { [baseInstance.instanceId]: baseInstance },
        order: [baseInstance.instanceId],
        nextInstanceNumber: 2,
      });
    });

    unmaximizeProjectChatWindow(baseInstance.instanceId);
    await flushPendingProjectChatWindowingWrites();

    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        baseInstance.instanceId
      ],
    ).toMatchObject({
      isMaximized: false,
      placement: ChatWindowPlacementEnum.bottom_docked,
      lastPlacementBeforeMaximize: null,
    });
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

  it("keeps the non-canvas section binding authoritative even when hidden", () => {
    const hiddenFloating = createProjectChatWindowInstance({
      instanceId: "chat-window-hidden",
      placement: ChatWindowPlacementEnum.floating,
      sectionIdOrNull: "section-1",
      isClosed: true,
      zIndex: 3,
    });
    const canvas = createProjectChatWindowInstance({
      instanceId: "chat-window-canvas",
      placement: ChatWindowPlacementEnum.canvas_section,
      sectionIdOrNull: "section-1",
      zIndex: 1,
    });
    const initial = createProjectChatWindowingState({
      instancesById: {
        [hiddenFloating.instanceId]: hiddenFloating,
        [canvas.instanceId]: canvas,
      },
      order: [canvas.instanceId, hiddenFloating.instanceId],
      nextInstanceNumber: 3,
    });

    expect(
      getExternalProjectChatWindowBindingForSectionInState(initial, "section-1")
        ?.instanceId,
    ).toBe(hiddenFloating.instanceId);
    expect(
      getOpenExternalProjectChatWindowInstanceForSectionInState(
        initial,
        "section-1",
      ),
    ).toBeNull();
  });

  it("shows an existing section binding in a floating window without resetting its mode", () => {
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
      ChatWindowPlacementEnum.floating,
    );
    expect(next.instancesById[canvas.instanceId]?.mode).toBe(
      ChatWindowModeEnum.project_ai_mode,
    );
    expect(next.instancesById[canvas.instanceId]?.isClosed).toBe(false);
    expect(next.instancesById[canvas.instanceId]?.isMinimized).toBe(false);
  });

  it("creates a new floating section window when a section has not been externalized yet", () => {
    const initial = createProjectChatWindowingState();

    const next = showSectionInProjectChatWindowInState(initial, "section-7");

    const created = next.instancesById["project-chat-window-1"];
    if (!created) {
      throw new Error("Expected a newly created section window.");
    }
    expect(created.sectionIdOrNull).toBe("section-7");
    expect(created.placement).toBe(ChatWindowPlacementEnum.floating);
    expect(created.mode).toBe(ChatWindowModeEnum.section_mode);
  });

  it("rebases canvas boot on the latest windowing state after async section creation", async () => {
    let resolveCreated: ((value: { sectionId: string } | null) => void) | null =
      null;
    const createdPromise = new Promise<{ sectionId: string } | null>(
      (resolve) => {
        resolveCreated = resolve;
      },
    );
    hoistedProjectChatWindowing.createTopLevelSectionWithResult.mockReturnValue(
      createdPromise,
    );

    const target = createProjectChatWindowInstance({
      instanceId: "chat-window-target",
      placement: ChatWindowPlacementEnum.floating,
      sectionIdOrNull: null,
      bounds: {
        x: 40,
        y: 80,
        width: 640,
        height: 420,
      },
    });
    const peer = createProjectChatWindowInstance({
      instanceId: "chat-window-peer",
      placement: ChatWindowPlacementEnum.floating,
      sectionIdOrNull: null,
      bounds: {
        x: 200,
        y: 220,
        width: 500,
        height: 360,
      },
    });
    useProjectState.setState((state) => {
      state.projectChatWindowing = createProjectChatWindowingState({
        order: [target.instanceId, peer.instanceId],
        instancesById: {
          [target.instanceId]: target,
          [peer.instanceId]: peer,
        },
        nextInstanceNumber: 3,
      });
    });

    const bootPromise = bootProjectChatWindowToCanvasSection(target.instanceId);

    setProjectChatWindowBounds(peer.instanceId, {
      x: 920,
      y: 640,
    });

    resolveCreated?.({ sectionId: "section-created" });

    await expect(bootPromise).resolves.toBe("section-created");

    const finalState = useProjectState.getState().projectChatWindowing;
    expect(finalState.instancesById[target.instanceId]?.placement).toBe(
      ChatWindowPlacementEnum.canvas_section,
    );
    expect(finalState.instancesById[target.instanceId]?.sectionIdOrNull).toBe(
      "section-created",
    );
    expect(finalState.instancesById[peer.instanceId]?.bounds).toEqual({
      x: 920,
      y: 640,
      width: 500,
      height: 360,
    });
  });

  it("passes the current window title into atomic canvas boot and clears it after binding", async () => {
    hoistedProjectChatWindowing.createTopLevelSectionWithResult.mockResolvedValue(
      {
        sectionId: "section-created",
      },
    );
    const target = createProjectChatWindowInstance({
      instanceId: "chat-window-target",
      placement: ChatWindowPlacementEnum.floating,
      title: "Coast Bear",
    });
    useProjectState.setState((state) => {
      state.projectChatWindowing = createProjectChatWindowingState({
        order: [target.instanceId],
        instancesById: {
          [target.instanceId]: target,
        },
        nextInstanceNumber: 2,
      });
    });

    await expect(
      bootProjectChatWindowToCanvasSection(target.instanceId),
    ).resolves.toBe("section-created");

    expect(
      hoistedProjectChatWindowing.createTopLevelSectionWithResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Coast Bear",
      }),
    );
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        target.instanceId
      ]?.title,
    ).toBeNull();
  });

  it("does not boot git graph windows into canvas sections", async () => {
    const target = createProjectChatWindowInstance({
      instanceId: "chat-window-target",
      placement: ChatWindowPlacementEnum.maximized,
      mode: ChatWindowModeEnum.git_graph_mode,
      title: "Git Graph",
    });
    useProjectState.setState((state) => {
      state.projectChatWindowing = createProjectChatWindowingState({
        order: [target.instanceId],
        instancesById: {
          [target.instanceId]: target,
        },
        nextInstanceNumber: 2,
      });
    });

    await expect(
      bootProjectChatWindowToCanvasSection(target.instanceId),
    ).resolves.toBeNull();
    expect(
      hoistedProjectChatWindowing.createTopLevelSectionWithResult,
    ).not.toHaveBeenCalled();
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        target.instanceId
      ]?.placement,
    ).toBe(ChatWindowPlacementEnum.maximized);
  });
});
