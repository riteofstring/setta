import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import { useAIStore, useMisc, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  createProjectConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootProjectChatWindowToCanvasSection,
  getExternalProjectChatWindowBindingForSectionInState,
  getOpenExternalProjectChatWindowInstanceForSectionInState,
  setProjectChatWindowBounds,
  showSectionInProjectChatWindowInState,
  undockProjectChatWindowFromCanvasSectionInState,
} from "./projectChatWindowing";

const hoistedProjectChatWindowing = vi.hoisted(() => ({
  createTopLevelSectionWithResult: vi.fn(),
  routeSetProjectChatWindowingState: vi.fn(),
  routeSetProjectChatWindowChatId: vi.fn(),
}));

vi.mock("./sections/createSections", () => ({
  createTopLevelSectionWithResult:
    hoistedProjectChatWindowing.createTopLevelSectionWithResult,
}));

vi.mock("openapi/http", () => ({
  setProjectChatWindowingState: (...args: unknown[]) =>
    hoistedProjectChatWindowing.routeSetProjectChatWindowingState(...args),
  setProjectChatWindowChatId: (...args: unknown[]) =>
    hoistedProjectChatWindowing.routeSetProjectChatWindowChatId(...args),
}));

function createOpenAPIDataResponse<TData>(
  data: TData,
  status: number = 200,
): {
  data: TData;
  response: Response;
} {
  return {
    data,
    response: new Response(null, { status }),
  };
}

describe("project chat windowing canvas bindings", () => {
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
        body: {
          state: ReturnType<typeof createProjectChatWindowingState>;
        };
      }) => createOpenAPIDataResponse(request.body.state),
    );
    hoistedProjectChatWindowing.routeSetProjectChatWindowChatId.mockReset();
    hoistedProjectChatWindowing.routeSetProjectChatWindowChatId.mockImplementation(
      async () =>
        createOpenAPIDataResponse(
          useProjectState.getState().projectChatWindowing,
        ),
    );
    gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
    gpuFlowViewportStore.getState().setViewportSize({
      height: 0,
      width: 0,
    });
    gpuFlowViewportStore.getState().setDomNode(null);
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
    let resolveCreated:
      | ((
          value: {
            sectionId: string;
          } | null,
        ) => void)
      | null = null;
    const createdPromise = new Promise<{
      sectionId: string;
    } | null>((resolve) => {
      resolveCreated = resolve;
    });
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

  it("uses the misc pane click position when booting a chat window to canvas", async () => {
    hoistedProjectChatWindowing.createTopLevelSectionWithResult.mockResolvedValue(
      {
        sectionId: "section-created",
      },
    );
    gpuFlowViewportStore.getState().setDomNode({
      getBoundingClientRect: () => ({
        x: 100,
        y: 200,
        left: 100,
        top: 200,
        right: 600,
        bottom: 600,
        width: 500,
        height: 400,
        toJSON: () => ({}),
      }),
    } as HTMLElement);
    useMisc.setState({
      lastPaneClickLocation: { x: 160, y: 290 },
    });
    const target = createProjectChatWindowInstance({
      instanceId: "chat-window-target",
      placement: ChatWindowPlacementEnum.floating,
      sectionIdOrNull: null,
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
        position: { x: 160, y: 290 },
      }),
    );
  });

  it("restores the GPU viewport after canvas boot section creation", async () => {
    hoistedProjectChatWindowing.createTopLevelSectionWithResult.mockImplementation(
      async () => {
        gpuFlowViewportStore.getState().setTransform([320, 240, 2]);
        return {
          sectionId: "section-created",
        };
      },
    );
    gpuFlowViewportStore.getState().setTransform([20, 30, 1.5]);
    const target = createProjectChatWindowInstance({
      instanceId: "chat-window-target",
      placement: ChatWindowPlacementEnum.floating,
      sectionIdOrNull: null,
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

    expect(gpuFlowViewportStore.getState().transform).toEqual([20, 30, 1.5]);
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
