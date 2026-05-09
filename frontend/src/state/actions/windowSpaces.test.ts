import {
  buildFloatingSnapBounds,
  buildFloatingSnapResizeHandles,
  resolveFloatingSnapPresetFromBounds,
} from "components/ChatWindowing/projectChatSnapLayout";
import { buildProjectChatEphemeralWindowInstanceKey } from "state/actions/projectChatWindowingEphemeral";
import {
  useMisc,
  usePendingOperations,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  NotificationTypeEnum,
  SectionTypeEnum,
  createChatSectionImpl,
  createCore,
  createProjectChatWindowingState,
  createProjectConfig,
  createSingleConfig,
  createVariant,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  focusProjectChatWindow,
  replaceProjectChatWindowingState,
  setProjectChatWindowBounds,
} from "./projectChatWindowing";
import { processProjectStateUpdateFromBackend } from "./sectionInfos";
import {
  createProjectChatWindowingStateFromWindowSpace,
  createWindowSpaceFromCurrentFloatingWindows,
  deleteWindowSpace,
  persistWindowSpaceSortOrder,
  restoreWindowSpaceInWorkspace,
  setWindowSpaceName,
  snapshotFloatingWindowsForWindowSpace,
  sortWindowSpaces,
} from "./windowSpaces";
const routeCreateWindowSpaceMock = vi.fn();
const routeDeleteWindowSpaceMock = vi.fn();
const routeSetWindowSpaceNameMock = vi.fn();
const routeSetWindowSpaceSortOrderMock = vi.fn();
const routeSetProjectChatWindowingStateMock = vi.fn();
const routeSetProjectChatWindowChatIdMock = vi.fn();
const addTemporaryNotificationMock = vi.fn();
function openAPISuccess<T>(data: T, status = 200) {
  return {
    data,
    response: new Response(null, { status }),
  };
}
function openAPIError(error: unknown, status: number) {
  return {
    error,
    response: new Response(null, { status }),
  };
}
type OpenAPISuccess<T> = {
  data: T;
  response: Response;
};
type ProjectChatWindowingOpenAPISuccess = OpenAPISuccess<
  ReturnType<typeof createProjectChatWindowingState>
>;
vi.mock("openapi/http", () => ({
  createWindowSpace: (...args: unknown[]) =>
    routeCreateWindowSpaceMock(...args),
  deleteWindowSpace: (...args: unknown[]) =>
    routeDeleteWindowSpaceMock(...args),
  setWindowSpaceSortOrder: (...args: unknown[]) =>
    routeSetWindowSpaceSortOrderMock(...args),
  setWindowSpaceName: (...args: unknown[]) =>
    routeSetWindowSpaceNameMock(...args),
  setProjectChatWindowingState: (...args: unknown[]) =>
    routeSetProjectChatWindowingStateMock(...args),
  setProjectChatWindowChatId: (...args: unknown[]) =>
    routeSetProjectChatWindowChatIdMock(...args),
  setSectionName: vi.fn(),
}));
vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: (...args: unknown[]) =>
    addTemporaryNotificationMock(...args),
}));
function buildCreatedWindowSpaceResponse(request: {
  name?: string | null;
  state: {
    windowsById: Record<string, unknown>;
    order: Array<string>;
  };
  id?: string;
}) {
  const projectConfig = useProjectState.getState().projectConfig;
  const nextSortIndex =
    Object.values(projectConfig.windowSpaces).reduce(
      (maxSortIndex, windowSpace) =>
        Math.max(maxSortIndex, windowSpace.sortIndex),
      -1,
    ) + 1;
  const createdWindowSpace = createWindowSpaceConfig({
    id: request.id ?? "window-space-1",
    name: request.name?.trim() ? request.name.trim() : "Focused Layout",
    sortIndex: nextSortIndex,
    windowsById: request.state.windowsById,
    order: request.state.order,
  });
  return openAPISuccess({
    projectConfig: createProjectConfig({
      ...projectConfig,
      windowSpaces: {
        ...projectConfig.windowSpaces,
        [createdWindowSpace.id]: createdWindowSpace,
      },
    }),
    windowSpaceId: createdWindowSpace.id,
  });
}
function cloneWindowSpacesForTest(
  windowSpaces: Record<string, ReturnType<typeof createWindowSpaceConfig>>,
) {
  return Object.fromEntries(
    Object.entries(windowSpaces).map(([windowSpaceId, windowSpace]) => [
      windowSpaceId,
      createWindowSpaceConfig({
        ...windowSpace,
        windowsById: windowSpace.windowsById,
        order: [...windowSpace.order],
      }),
    ]),
  );
}
function buildProjectConfigMutationResponse(
  windowSpaces: Record<string, ReturnType<typeof createWindowSpaceConfig>>,
) {
  const projectConfig = useProjectState.getState().projectConfig;
  return openAPISuccess({
    projectConfig: createProjectConfig({
      ...projectConfig,
      windowSpaces,
    }),
  });
}
function buildWindowSpacesAfterDelete(
  windowSpaces: Record<string, ReturnType<typeof createWindowSpaceConfig>>,
  deletedWindowSpaceId: string,
) {
  const nextWindowSpaces = cloneWindowSpacesForTest(windowSpaces);
  delete nextWindowSpaces[deletedWindowSpaceId];
  const sortedWindowSpaces = sortWindowSpaces(Object.values(nextWindowSpaces));
  sortedWindowSpaces.forEach((windowSpace, index) => {
    nextWindowSpaces[windowSpace.id] = createWindowSpaceConfig({
      ...windowSpace,
      sortIndex: index,
    });
  });
  return nextWindowSpaces;
}
function mockAcceptedWindowSpaceMutationRoutes() {
  routeSetWindowSpaceNameMock.mockImplementation(async (request) => {
    const body = request.body;
    const windowSpaces = cloneWindowSpacesForTest(
      useProjectState.getState().projectConfig.windowSpaces,
    );
    const currentWindowSpace = windowSpaces[body.windowSpaceId];
    if (!currentWindowSpace) {
      return openAPIError({ detail: "Window space not found." }, 404);
    }
    windowSpaces[body.windowSpaceId] = createWindowSpaceConfig({
      ...currentWindowSpace,
      name: body.name,
    });
    return buildProjectConfigMutationResponse(windowSpaces);
  });
  routeSetWindowSpaceSortOrderMock.mockImplementation(async (request) => {
    const body = request.body;
    const windowSpaces = cloneWindowSpacesForTest(
      useProjectState.getState().projectConfig.windowSpaces,
    );
    body.orderedWindowSpaceIds.forEach((windowSpaceId, index) => {
      const currentWindowSpace = windowSpaces[windowSpaceId];
      if (!currentWindowSpace) {
        return;
      }
      windowSpaces[windowSpaceId] = createWindowSpaceConfig({
        ...currentWindowSpace,
        sortIndex: index,
      });
    });
    return buildProjectConfigMutationResponse(windowSpaces);
  });
  routeDeleteWindowSpaceMock.mockImplementation(async (request) =>
    buildProjectConfigMutationResponse(
      buildWindowSpacesAfterDelete(
        useProjectState.getState().projectConfig.windowSpaces,
        request.body.windowSpaceId,
      ),
    ),
  );
}
function mockAcceptedProjectChatWindowingStateRoute() {
  routeSetProjectChatWindowingStateMock.mockImplementation(async (request) =>
    openAPISuccess(request.body.state),
  );
}
function mockAcceptedProjectChatWindowChatIdRoute() {
  routeSetProjectChatWindowChatIdMock.mockImplementation(async (request) => {
    const body = request.body;
    const currentWindowing = useProjectState.getState().projectChatWindowing;
    const currentWindow = currentWindowing.instancesById[body.instanceId];
    if (!currentWindow) {
      return openAPIError({ detail: "Project chat window not found." }, 404);
    }
    return openAPISuccess(
      createProjectChatWindowingState({
        ...currentWindowing,
        instancesById: {
          ...currentWindowing.instancesById,
          [body.instanceId]: {
            ...currentWindow,
            chatId: body.chatId,
          },
        },
      }),
    );
  });
}
function mockAcceptedProjectChatWindowingMutationRoutes() {
  mockAcceptedProjectChatWindowingStateRoute();
  mockAcceptedProjectChatWindowChatIdRoute();
}
async function flushOptimisticMutation(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
function buildChatSectionState(
  sectionId: string,
  chatId: string | null = null,
) {
  const variantId = `${sectionId}-variant`;
  const implId = `${sectionId}-impl`;
  return {
    sections: {
      [sectionId]: createCore({
        id: sectionId,
        name: "Research Notes",
      }),
    },
    sectionVariants: {
      [variantId]: createVariant({
        id: variantId,
        impl: implId,
        nonPresetImpls: [],
      }),
    },
    sectionImpls: {
      [implId]: createChatSectionImpl({
        id: implId,
        type: SectionTypeEnum.Chat,
        chatId,
      }),
    },
    projectConfig: createProjectConfig({
      id: "project-id",
      name: "demo",
      sectionVariantMap: {
        [sectionId]: variantId,
      },
    }),
  };
}
function setDeploymentSharePolicy({
  allowLayoutChanges,
  allowLLM,
}: {
  allowLayoutChanges: boolean;
  allowLLM: boolean;
}) {
  useShareSession.setState({
    isDeploymentMode: true,
    shareSessionId: "share-session-1",
    sessionRunCount: 0,
    sharePolicy: {
      allowLLM,
      allowLayoutChanges,
      allowParamChanges: false,
      allowVariantChanges: false,
      allowRun: false,
      allowMultipleRuns: false,
    },
    shareDeploymentName: "deployment",
    shareDeploymentVersion: "v1",
    deploymentMode: "share",
  });
}
describe("snapshotFloatingWindowsForWindowSpace", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateWindowSpaceMock.mockReset();
    routeDeleteWindowSpaceMock.mockReset();
    routeSetWindowSpaceNameMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    routeSetProjectChatWindowChatIdMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    usePendingOperations.setState({ pending: [] });
    mockAcceptedProjectChatWindowingMutationRoutes();
  });
  it("serializes only visible floating windows with normalized bounds", () => {
    const state = {
      ...buildChatSectionState("section-1", "section-thread"),
      projectChatWindowing: createProjectChatWindowingState({
        order: [
          "floating-chat",
          "floating-section",
          "docked-chat",
          "minimized-chat",
        ],
        instancesById: {
          "floating-chat": {
            instanceId: "floating-chat",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Research Chat",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 2,
            bounds: {
              x: 100,
              y: 50,
              width: 400,
              height: 300,
            },
          },
          "floating-section": {
            instanceId: "floating-section",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 5,
            bounds: {
              x: 500,
              y: 200,
              width: 300,
              height: 400,
            },
          },
          "docked-chat": {
            instanceId: "docked-chat",
            placement: ChatWindowPlacementEnum.bottom_docked,
            mode: ChatWindowModeEnum.project_ai_mode,
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 1,
            bounds: {
              x: 0,
              y: 0,
              width: 300,
              height: 200,
            },
          },
          "minimized-chat": {
            instanceId: "minimized-chat",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            isClosed: false,
            isMinimized: true,
            isMaximized: false,
            zIndex: 3,
            bounds: {
              x: 0,
              y: 0,
              width: 300,
              height: 200,
            },
          },
        },
      }),
    };
    const snapshot = snapshotFloatingWindowsForWindowSpace(state, {
      viewportWidthPx: 1000,
      viewportHeightPx: 800,
      insets: {
        left: 100,
        right: 100,
        top: 50,
        bottom: 50,
      },
    });
    expect(snapshot.order).toEqual(["floating-chat", "floating-section"]);
    expect(snapshot.windowsById["floating-chat"]).toMatchObject({
      surfaceKind: "project_chat",
      title: "Research Chat",
      zIndex: 2,
      normalizedBounds: {
        x: 0,
        y: 0,
        width: 0.5,
        height: 300 / 700,
      },
    });
    expect(snapshot.windowsById["floating-section"]).toMatchObject({
      surfaceKind: "section",
      sectionIdOrNull: "section-1",
      chatId: null,
      title: null,
      zIndex: 5,
      normalizedBounds: {
        x: 0.5,
        y: 150 / 700,
        width: 0.375,
        height: 400 / 700,
      },
    });
    expect(snapshot.windowsById["docked-chat"]).toBeUndefined();
    expect(snapshot.windowsById["minimized-chat"]).toBeUndefined();
  });
  it("does not locally arbitrate duplicate floating section bindings when snapshotting", () => {
    const snapshot = snapshotFloatingWindowsForWindowSpace({
      ...buildChatSectionState("section-1", "section-thread"),
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-section-a", "floating-section-b"],
        instancesById: {
          "floating-section-a": {
            instanceId: "floating-section-a",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 1,
            bounds: {
              x: 40,
              y: 50,
              width: 320,
              height: 240,
            },
            lastFocusedAt: 1,
          },
          "floating-section-b": {
            instanceId: "floating-section-b",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            sectionIdOrNull: "section-1",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 4,
            bounds: {
              x: 380,
              y: 60,
              width: 320,
              height: 240,
            },
            lastFocusedAt: 2,
          },
        },
      }),
    });
    expect(snapshot.order).toEqual([
      "floating-section-a",
      "floating-section-b",
    ]);
    expect(Object.keys(snapshot.windowsById)).toEqual([
      "floating-section-a",
      "floating-section-b",
    ]);
    expect(snapshot.windowsById["floating-section-a"]?.mode).toBe(
      ChatWindowModeEnum.section_mode,
    );
    expect(snapshot.windowsById["floating-section-b"]?.mode).toBe(
      ChatWindowModeEnum.project_ai_mode,
    );
  });
  it("persists embedded git-pane visibility for saved git graph windows", () => {
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-id",
          "graph-window",
        )]: true,
      },
    });
    const snapshot = snapshotFloatingWindowsForWindowSpace({
      projectChatWindowing: createProjectChatWindowingState({
        order: ["graph-window"],
        instancesById: {
          "graph-window": {
            instanceId: "graph-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.git_graph_mode,
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 4,
            bounds: {
              x: 24,
              y: 32,
              width: 480,
              height: 320,
            },
          },
        },
      }),
      sections: {},
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
    });
    expect(snapshot.windowsById["graph-window"]).toMatchObject({
      mode: ChatWindowModeEnum.git_graph_mode,
      embeddedGitPaneVisible: true,
    });
  });
  it("clears inert section titles when snapshotting and restoring floating section windows", () => {
    const snapshot = snapshotFloatingWindowsForWindowSpace({
      ...buildChatSectionState("section-1", "section-thread"),
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-section"],
        instancesById: {
          "floating-section": {
            instanceId: "floating-section",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            title: "Ignored Section Title",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 4,
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
        },
      }),
    });
    expect(snapshot.windowsById["floating-section"]?.title).toBeNull();
    const restored = createProjectChatWindowingStateFromWindowSpace(
      {
        id: "space-1",
        name: "Focused Layout",
        sortIndex: 0,
        windowsById: {
          "floating-section": {
            surfaceKind: "section",
            sectionIdOrNull: "section-1",
            mode: ChatWindowModeEnum.section_mode,
            title: "Still Ignored",
            zIndex: 4,
            normalizedBounds: {
              x: 0.1,
              y: 0.2,
              width: 0.5,
              height: 0.4,
            },
          },
        },
        order: ["floating-section"],
      },
      {
        sections: {
          "section-1": createCore({
            id: "section-1",
            name: "Research Notes",
          }),
        },
      },
      {
        viewportWidthPx: 1000,
        viewportHeightPx: 800,
        insets: {
          left: 100,
          right: 100,
          top: 50,
          bottom: 50,
        },
      },
    );
    expect(restored.instancesById["floating-section"]?.title).toBeNull();
  });
  it("round-trips snapped layouts back onto the shared resize grid", () => {
    const viewport = {
      viewportWidthPx: 1440,
      viewportHeightPx: 900,
      insets: {
        left: 40,
        right: 40,
        top: 52,
        bottom: 0,
      },
    };
    const state = {
      ...buildChatSectionState("section-1", "section-thread"),
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-left", "floating-right"],
        instancesById: {
          "floating-left": {
            instanceId: "floating-left",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 2,
            bounds: buildFloatingSnapBounds(
              "left",
              viewport.viewportWidthPx,
              viewport.viewportHeightPx,
              viewport.insets,
            ),
          },
          "floating-right": {
            instanceId: "floating-right",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 5,
            bounds: buildFloatingSnapBounds(
              "right",
              viewport.viewportWidthPx,
              viewport.viewportHeightPx,
              viewport.insets,
            ),
          },
        },
      }),
    };
    const snapshot = snapshotFloatingWindowsForWindowSpace(state, viewport);
    const restored = createProjectChatWindowingStateFromWindowSpace(
      {
        id: "space-1",
        name: "Snapped Layout",
        sortIndex: 0,
        windowsById: snapshot.windowsById,
        order: snapshot.order,
      },
      {
        sections: state.sections,
      },
      viewport,
    );
    expect(restored.order).toEqual(["floating-left", "floating-right"]);
    expect(
      resolveFloatingSnapPresetFromBounds(
        restored.instancesById["floating-left"].bounds,
        viewport.viewportWidthPx,
        viewport.viewportHeightPx,
        viewport.insets,
      ),
    ).toBe("left");
    expect(
      resolveFloatingSnapPresetFromBounds(
        restored.instancesById["floating-right"].bounds,
        viewport.viewportWidthPx,
        viewport.viewportHeightPx,
        viewport.insets,
      ),
    ).toBe("right");
    expect(
      buildFloatingSnapResizeHandles(
        restored.order.map((instanceId) => ({
          instanceId,
          bounds: restored.instancesById[instanceId].bounds,
          snapPreset: resolveFloatingSnapPresetFromBounds(
            restored.instancesById[instanceId].bounds,
            viewport.viewportWidthPx,
            viewport.viewportHeightPx,
            viewport.insets,
          )!,
        })),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          axis: "vertical",
          leadingInstanceIds: ["floating-left"],
          trailingInstanceIds: ["floating-right"],
        }),
      ]),
    );
  });
  it("normalizes restored floating window z-index ties into a stable layering order", () => {
    const restored = createProjectChatWindowingStateFromWindowSpace(
      {
        id: "space-1",
        name: "Tied Layout",
        sortIndex: 0,
        windowsById: {
          "floating-a": {
            surfaceKind: "chat",
            sectionIdOrNull: null,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "A",
            zIndex: 9,
            normalizedBounds: {
              x: 0.1,
              y: 0.1,
              width: 0.3,
              height: 0.3,
            },
          },
          "floating-b": {
            surfaceKind: "chat",
            sectionIdOrNull: null,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "B",
            zIndex: 9,
            normalizedBounds: {
              x: 0.5,
              y: 0.1,
              width: 0.3,
              height: 0.3,
            },
          },
        },
        order: ["floating-a", "floating-b"],
      },
      {
        sections: {},
      },
      {
        viewportWidthPx: 1000,
        viewportHeightPx: 800,
        insets: {
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        },
      },
    );
    expect(restored.instancesById["floating-a"]?.zIndex).toBe(1);
    expect(restored.instancesById["floating-b"]?.zIndex).toBe(2);
  });
});
describe("window-space optimistic rollback", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateWindowSpaceMock.mockReset();
    routeDeleteWindowSpaceMock.mockReset();
    routeSetWindowSpaceNameMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    routeSetProjectChatWindowChatIdMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    usePendingOperations.setState({ pending: [] });
    mockAcceptedProjectChatWindowingStateRoute();
    mockAcceptedWindowSpaceMutationRoutes();
    mockAcceptedProjectChatWindowChatIdRoute();
  });
  it("rolls back a rejected reorder to the authoritative sort order", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
          "beta-id": createWindowSpaceConfig({
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          }),
          "gamma-id": createWindowSpaceConfig({
            id: "gamma-id",
            name: "Gamma",
            sortIndex: 2,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeSetWindowSpaceSortOrderMock.mockResolvedValue(
      openAPIError({ detail: "Forbidden" }, 403),
    );
    persistWindowSpaceSortOrder("project-id", [
      "gamma-id",
      "alpha-id",
      "beta-id",
    ]);
    await flushOptimisticMutation();
    expect(routeSetWindowSpaceSortOrderMock).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-id",
        orderedWindowSpaceIds: ["gamma-id", "alpha-id", "beta-id"],
        frontendOpId: expect.any(String),
      },
    });
    const windowSpaces = useProjectState.getState().projectConfig.windowSpaces;
    expect(windowSpaces["alpha-id"]?.sortIndex).toBe(0);
    expect(windowSpaces["beta-id"]?.sortIndex).toBe(1);
    expect(windowSpaces["gamma-id"]?.sortIndex).toBe(2);
    expect(
      Object.values(windowSpaces)
        .sort((a, b) => a.sortIndex - b.sortIndex)
        .map((windowSpace) => windowSpace.id),
    ).toEqual(["alpha-id", "beta-id", "gamma-id"]);
    expect(usePendingOperations.getState().pending).toEqual([]);
  });
  it("rolls back a rejected delete to the authoritative window-space list", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
          "beta-id": createWindowSpaceConfig({
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeDeleteWindowSpaceMock.mockResolvedValue(
      openAPIError({ detail: "Forbidden" }, 403),
    );
    deleteWindowSpace("project-id", "alpha-id");
    await flushOptimisticMutation();
    const windowSpaces = useProjectState.getState().projectConfig.windowSpaces;
    expect(Object.keys(windowSpaces)).toEqual(["alpha-id", "beta-id"]);
    expect(windowSpaces["alpha-id"]?.sortIndex).toBe(0);
    expect(windowSpaces["beta-id"]?.sortIndex).toBe(1);
    expect(usePendingOperations.getState().pending).toEqual([]);
  });
  it("rolls back a transport-failed rename to the authoritative name", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeSetWindowSpaceNameMock.mockRejectedValue(
      new Error("synthetic transport failure"),
    );
    setWindowSpaceName("project-id", "alpha-id", "Renamed Alpha");
    await flushOptimisticMutation();
    expect(
      useProjectState.getState().projectConfig.windowSpaces["alpha-id"]?.name,
    ).toBe("Alpha");
    expect(usePendingOperations.getState().pending).toEqual([]);
  });
  it("does not roll back a rename into a different project after navigation", async () => {
    const projectBWindowSpaces = {
      "beta-id": createWindowSpaceConfig({
        id: "beta-id",
        name: "Beta",
        sortIndex: 0,
        windowsById: {},
        order: [],
      }),
    };
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeSetWindowSpaceNameMock.mockResolvedValue(
      openAPIError({ detail: "Forbidden" }, 403),
    );
    setWindowSpaceName("project-id", "alpha-id", "Renamed Alpha");
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-b",
        name: "demo-b",
        windowSpaces: projectBWindowSpaces,
      }),
    });
    await flushOptimisticMutation();
    expect(useProjectState.getState().projectConfig.id).toBe("project-b");
    expect(useProjectState.getState().projectConfig.windowSpaces).toEqual(
      projectBWindowSpaces,
    );
    expect(usePendingOperations.getState().pending).toEqual([]);
  });
  it("replays a later accepted delete after an earlier rename fails out of order", async () => {
    let resolveRenameWrite:
      | ((value: ReturnType<typeof openAPIError>) => void)
      | null = null;
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
          "beta-id": createWindowSpaceConfig({
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeSetWindowSpaceNameMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRenameWrite = resolve;
      }),
    );
    routeDeleteWindowSpaceMock.mockResolvedValue(
      buildProjectConfigMutationResponse({
        "alpha-id": createWindowSpaceConfig({
          id: "alpha-id",
          name: "Alpha",
          sortIndex: 0,
          windowsById: {},
          order: [],
        }),
      }),
    );
    setWindowSpaceName("project-id", "alpha-id", "Renamed Alpha");
    deleteWindowSpace("project-id", "beta-id");
    await flushOptimisticMutation();
    resolveRenameWrite?.(openAPIError({ detail: "Forbidden" }, 403));
    await flushOptimisticMutation();
    const windowSpaces = useProjectState.getState().projectConfig.windowSpaces;
    expect(windowSpaces["alpha-id"]?.name).toBe("Alpha");
    expect(windowSpaces["alpha-id"]?.sortIndex).toBe(0);
    expect(windowSpaces["beta-id"]).toBeUndefined();
    expect(usePendingOperations.getState().pending).toHaveLength(1);
    expect(usePendingOperations.getState().pending[0]?.acknowledged).toBe(true);
  });
  it("replays a later accepted reorder after an earlier rename fails out of order", async () => {
    let resolveRenameWrite:
      | ((value: ReturnType<typeof openAPIError>) => void)
      | null = null;
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
          "beta-id": createWindowSpaceConfig({
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          }),
          "gamma-id": createWindowSpaceConfig({
            id: "gamma-id",
            name: "Gamma",
            sortIndex: 2,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeSetWindowSpaceNameMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRenameWrite = resolve;
      }),
    );
    routeSetWindowSpaceSortOrderMock.mockResolvedValue(
      buildProjectConfigMutationResponse({
        "alpha-id": createWindowSpaceConfig({
          id: "alpha-id",
          name: "Alpha",
          sortIndex: 1,
          windowsById: {},
          order: [],
        }),
        "beta-id": createWindowSpaceConfig({
          id: "beta-id",
          name: "Beta",
          sortIndex: 2,
          windowsById: {},
          order: [],
        }),
        "gamma-id": createWindowSpaceConfig({
          id: "gamma-id",
          name: "Gamma",
          sortIndex: 0,
          windowsById: {},
          order: [],
        }),
      }),
    );
    setWindowSpaceName("project-id", "alpha-id", "Renamed Alpha");
    persistWindowSpaceSortOrder("project-id", [
      "gamma-id",
      "alpha-id",
      "beta-id",
    ]);
    await flushOptimisticMutation();
    resolveRenameWrite?.(openAPIError({ detail: "Forbidden" }, 403));
    await flushOptimisticMutation();
    const orderedWindowSpaces = Object.values(
      useProjectState.getState().projectConfig.windowSpaces,
    )
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((windowSpace) => ({
        id: windowSpace.id,
        name: windowSpace.name,
      }));
    expect(orderedWindowSpaces).toEqual([
      { id: "gamma-id", name: "Gamma" },
      { id: "alpha-id", name: "Alpha" },
      { id: "beta-id", name: "Beta" },
    ]);
    expect(usePendingOperations.getState().pending).toHaveLength(1);
    expect(usePendingOperations.getState().pending[0]?.acknowledged).toBe(true);
  });
  it("preserves newer unrelated backend project config fields after an acknowledged window-space mutation", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
          "beta-id": createWindowSpaceConfig({
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    routeSetWindowSpaceSortOrderMock.mockResolvedValue(
      buildProjectConfigMutationResponse({
        "alpha-id": createWindowSpaceConfig({
          id: "alpha-id",
          name: "Alpha",
          sortIndex: 1,
          windowsById: {},
          order: [],
        }),
        "beta-id": createWindowSpaceConfig({
          id: "beta-id",
          name: "Beta",
          sortIndex: 0,
          windowsById: {},
          order: [],
        }),
      }),
    );
    persistWindowSpaceSortOrder("project-id", ["beta-id", "alpha-id"]);
    await flushOptimisticMutation();
    expect(usePendingOperations.getState().pending).toHaveLength(1);
    expect(usePendingOperations.getState().pending[0]?.acknowledged).toBe(true);
    processProjectStateUpdateFromBackend({
      projectState: createSingleConfig({
        pluginData: {
          ...useProjectState.getState().pluginData,
          "setta-watch-code": {
            baselineByPath: {},
            enabled: true,
            files: [],
            folders: [],
            registry: {},
          },
        },
        projectConfig: createProjectConfig({
          ...useProjectState.getState().projectConfig,
        }),
      }),
      completedOpIds: [],
      pendingOpIds: [],
    });
    const state = useProjectState.getState();
    const projectConfig = state.projectConfig;
    expect(state.pluginData["setta-watch-code"]?.enabled).toBe(true);
    expect(projectConfig.windowSpaces["beta-id"]?.sortIndex).toBe(0);
    expect(projectConfig.windowSpaces["alpha-id"]?.sortIndex).toBe(1);
  });
});
describe("window-space share policy gating", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateWindowSpaceMock.mockReset();
    routeDeleteWindowSpaceMock.mockReset();
    routeSetWindowSpaceNameMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    routeSetProjectChatWindowChatIdMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    usePendingOperations.setState({ pending: [] });
  });
  it("skips save when deployment policy disallows layout changes", async () => {
    setDeploymentSharePolicy({
      allowLayoutChanges: false,
      allowLLM: true,
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-window"],
        instancesById: {
          "floating-window": {
            instanceId: "floating-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Research Chat",
            chatId: "chat-live",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            bounds: {
              x: 120,
              y: 80,
              width: 420,
              height: 320,
            },
          },
        },
      }),
    });
    const previousProjectConfig = structuredClone(
      useProjectState.getState().projectConfig,
    );
    const previousWindowing = structuredClone(
      useProjectState.getState().projectChatWindowing,
    );
    await expect(createWindowSpaceFromCurrentFloatingWindows()).resolves.toBe(
      null,
    );
    expect(routeSetProjectChatWindowingStateMock).not.toHaveBeenCalled();
    expect(routeCreateWindowSpaceMock).not.toHaveBeenCalled();
    expect(addTemporaryNotificationMock).not.toHaveBeenCalled();
    expect(useProjectState.getState().projectConfig).toEqual(
      previousProjectConfig,
    );
    expect(useProjectState.getState().projectChatWindowing).toEqual(
      previousWindowing,
    );
  });
  it("skips rename, delete, and reorder when deployment policy disallows layout changes", async () => {
    setDeploymentSharePolicy({
      allowLayoutChanges: false,
      allowLLM: true,
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "alpha-id": createWindowSpaceConfig({
            id: "alpha-id",
            name: "Alpha",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
          "beta-id": createWindowSpaceConfig({
            id: "beta-id",
            name: "Beta",
            sortIndex: 1,
            windowsById: {},
            order: [],
          }),
        },
      }),
    });
    const previousWindowSpaces = structuredClone(
      useProjectState.getState().projectConfig.windowSpaces,
    );
    setWindowSpaceName("project-id", "alpha-id", "Renamed Alpha");
    deleteWindowSpace("project-id", "beta-id");
    persistWindowSpaceSortOrder("project-id", ["beta-id", "alpha-id"]);
    await flushOptimisticMutation();
    expect(routeSetWindowSpaceNameMock).not.toHaveBeenCalled();
    expect(routeDeleteWindowSpaceMock).not.toHaveBeenCalled();
    expect(routeSetWindowSpaceSortOrderMock).not.toHaveBeenCalled();
    expect(addTemporaryNotificationMock).not.toHaveBeenCalled();
    expect(useProjectState.getState().projectConfig.windowSpaces).toEqual(
      previousWindowSpaces,
    );
  });
  it("blocks restore before layout mutation when saved thread rebinding needs disallowed LLM access", async () => {
    setDeploymentSharePolicy({
      allowLayoutChanges: true,
      allowLLM: false,
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": createWindowSpaceConfig({
            id: "space-1",
            name: "Saved Research",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Saved Chat",
                chatId: "chat-restored",
                zIndex: 3,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-2"],
          }),
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Live Chat",
            chatId: "chat-live",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 1,
            bounds: {
              x: 120,
              y: 100,
              width: 320,
              height: 220,
            },
          },
        },
        nextInstanceNumber: 2,
      }),
    });
    const previousWindowing = structuredClone(
      useProjectState.getState().projectChatWindowing,
    );
    await restoreWindowSpaceInWorkspace("space-1");
    expect(routeSetProjectChatWindowingStateMock).not.toHaveBeenCalled();
    expect(routeSetProjectChatWindowChatIdMock).not.toHaveBeenCalled();
    expect(useProjectState.getState().projectChatWindowing).toEqual(
      previousWindowing,
    );
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Cannot restore this window space because deployment policy disallows restoring saved chat threads.",
      NotificationTypeEnum.error,
    );
  });
});
describe("createWindowSpaceFromCurrentFloatingWindows", () => {
  beforeEach(() => {
    resetProjectStores();
    routeCreateWindowSpaceMock.mockReset();
    routeDeleteWindowSpaceMock.mockReset();
    routeSetWindowSpaceNameMock.mockReset();
    routeSetWindowSpaceSortOrderMock.mockReset();
    routeSetProjectChatWindowingStateMock.mockReset();
    addTemporaryNotificationMock.mockReset();
    usePendingOperations.setState({ pending: [] });
    mockAcceptedProjectChatWindowingStateRoute();
  });
  it("waits for in-flight project chat windowing writes before saving the current layout", async () => {
    let resolveWindowingWrite:
      | ((value: ProjectChatWindowingOpenAPISuccess) => void)
      | null = null;
    const pendingWindowingWrite =
      new Promise<ProjectChatWindowingOpenAPISuccess>((resolve) => {
        resolveWindowingWrite = resolve;
      });
    routeSetProjectChatWindowingStateMock.mockReturnValue(
      pendingWindowingWrite,
    );
    routeCreateWindowSpaceMock.mockImplementation(async (request) =>
      buildCreatedWindowSpaceResponse(request.body),
    );
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState(),
    });
    replaceProjectChatWindowingState(
      createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Research Chat",
            bounds: {
              x: 100,
              y: 120,
              width: 420,
              height: 320,
            },
          },
        },
      }),
    );
    const savePromise = createWindowSpaceFromCurrentFloatingWindows();
    await Promise.resolve();
    await Promise.resolve();
    expect(routeCreateWindowSpaceMock).not.toHaveBeenCalled();
    resolveWindowingWrite?.(
      openAPISuccess(useProjectState.getState().projectChatWindowing),
    );
    await expect(savePromise).resolves.toBe("window-space-1");
    expect(routeCreateWindowSpaceMock).toHaveBeenCalledTimes(1);
  });
  it("saves the latest window bounds and focus when the user keeps interacting during the pre-save sync", async () => {
    let resolveSync:
      | ((value: ProjectChatWindowingOpenAPISuccess) => void)
      | null = null;
    routeSetProjectChatWindowingStateMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSync = resolve;
      }),
    );
    routeCreateWindowSpaceMock.mockImplementation(async (request) =>
      buildCreatedWindowSpaceResponse(request.body),
    );
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["save-window"],
        instancesById: {
          "save-window": {
            instanceId: "save-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Save Window",
            zIndex: 1,
            lastFocusedAt: 10,
            bounds: {
              x: 100,
              y: 120,
              width: 420,
              height: 320,
            },
          },
        },
        nextInstanceNumber: 2,
      }),
    });
    const savePromise = createWindowSpaceFromCurrentFloatingWindows();
    await Promise.resolve();
    await Promise.resolve();
    focusProjectChatWindow("save-window", 4242);
    setProjectChatWindowBounds("save-window", {
      x: 260,
      y: 180,
      width: 520,
      height: 360,
    });
    await flushOptimisticMutation();
    const firstSyncRequest =
      routeSetProjectChatWindowingStateMock.mock.calls[0]?.[0];
    if (!firstSyncRequest) {
      throw new Error("Expected the pre-save sync request.");
    }
    resolveSync?.(openAPISuccess(firstSyncRequest.body.state));
    await expect(savePromise).resolves.toBe("window-space-1");
    const finalWindowing = useProjectState.getState().projectChatWindowing;
    expect(finalWindowing.instancesById["save-window"]).toMatchObject({
      lastFocusedAt: 4242,
      bounds: {
        x: 260,
        y: 180,
        width: 520,
        height: 360,
      },
    });
    const createRequest = routeCreateWindowSpaceMock.mock.calls[0]?.[0];
    expect(createRequest?.body.state).toEqual(
      snapshotFloatingWindowsForWindowSpace({
        projectChatWindowing: finalWindowing,
        projectConfig: useProjectState.getState().projectConfig,
        sections: useProjectState.getState().sections,
        sectionImpls: useProjectState.getState().sectionImpls,
        sectionVariants: useProjectState.getState().sectionVariants,
      }),
    );
  });
  it("persists the created window space into local project state after the backend accepts it", async () => {
    const sectionState = buildChatSectionState("section-1", "section-thread");
    useProjectState.setState({
      ...sectionState,
      projectConfig: sectionState.projectConfig,
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-section"],
        instancesById: {
          "floating-section": {
            instanceId: "floating-section",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 3,
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
        },
      }),
    });
    routeCreateWindowSpaceMock.mockImplementation(async (request) =>
      buildCreatedWindowSpaceResponse(request.body),
    );
    const createdWindowSpaceId =
      await createWindowSpaceFromCurrentFloatingWindows();
    expect(createdWindowSpaceId).toBe("window-space-1");
    expect(routeSetProjectChatWindowingStateMock).toHaveBeenCalledTimes(1);
    expect(routeCreateWindowSpaceMock).toHaveBeenCalledTimes(1);
    const createRequest = routeCreateWindowSpaceMock.mock.calls[0]?.[0];
    expect(createRequest?.body.projectConfigId).toBe("project-id");
    expect(createRequest?.body.name).toBeUndefined();
    expect(createRequest?.body.state.order).toEqual(["floating-section"]);
    expect(
      useProjectState.getState().projectConfig.windowSpaces["window-space-1"],
    ).toMatchObject({
      id: "window-space-1",
      name: "Focused Layout",
      order: ["floating-section"],
    });
  });
  it("does not merge a created window space into a different project after navigation", async () => {
    let resolveSync:
      | ((value: ProjectChatWindowingOpenAPISuccess) => void)
      | null = null;
    let resolveCreate:
      | ((value: ReturnType<typeof buildCreatedWindowSpaceResponse>) => void)
      | null = null;
    const projectBWindowSpaces = {
      "project-b-space": createWindowSpaceConfig({
        id: "project-b-space",
        name: "Project B Layout",
        sortIndex: 0,
        windowsById: {},
        order: [],
      }),
    };
    const projectBWindowing = createProjectChatWindowingState({
      order: ["project-b-window"],
      instancesById: {
        "project-b-window": {
          instanceId: "project-b-window",
          placement: ChatWindowPlacementEnum.floating,
          mode: ChatWindowModeEnum.project_ai_mode,
          title: "Project B Chat",
          bounds: {
            x: 24,
            y: 48,
            width: 360,
            height: 240,
          },
        },
      },
    });
    const sectionState = buildChatSectionState("section-1", "section-thread");
    useProjectState.setState({
      ...sectionState,
      projectConfig: sectionState.projectConfig,
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-section"],
        instancesById: {
          "floating-section": {
            instanceId: "floating-section",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
        },
      }),
    });
    routeSetProjectChatWindowingStateMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSync = resolve;
      }),
    );
    routeCreateWindowSpaceMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const savePromise = createWindowSpaceFromCurrentFloatingWindows();
    await Promise.resolve();
    await Promise.resolve();
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-b",
        name: "demo-b",
        windowSpaces: projectBWindowSpaces,
      }),
      sections: {},
      projectChatWindowing: projectBWindowing,
    });
    resolveSync?.(
      openAPISuccess(
        createProjectChatWindowingState({
          order: ["floating-section"],
          instancesById: {
            "floating-section": {
              instanceId: "floating-section",
              placement: ChatWindowPlacementEnum.floating,
              mode: ChatWindowModeEnum.section_mode,
              sectionIdOrNull: "section-1",
              bounds: {
                x: 120,
                y: 80,
                width: 500,
                height: 360,
              },
            },
          },
        }),
      ),
    );
    await flushOptimisticMutation();
    const createRequest = routeCreateWindowSpaceMock.mock.calls[0]?.[0];
    expect(createRequest?.body.projectConfigId).toBe("project-id");
    resolveCreate?.(
      buildCreatedWindowSpaceResponse({
        ...createRequest?.body,
        id: "window-space-1",
      }),
    );
    await expect(savePromise).resolves.toBe("window-space-1");
    expect(useProjectState.getState().projectConfig.id).toBe("project-b");
    expect(useProjectState.getState().projectConfig.windowSpaces).toEqual(
      projectBWindowSpaces,
    );
    expect(useProjectState.getState().projectChatWindowing).toEqual(
      projectBWindowing,
    );
  });
  it("shows an error notification when the backend rejects the save", async () => {
    const sectionState = buildChatSectionState("section-1", "section-thread");
    useProjectState.setState({
      ...sectionState,
      projectConfig: sectionState.projectConfig,
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-section"],
        instancesById: {
          "floating-section": {
            instanceId: "floating-section",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 3,
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
        },
      }),
    });
    routeCreateWindowSpaceMock.mockResolvedValue(
      openAPIError({ detail: "Not Found" }, 404),
    );
    const createdWindowSpaceId =
      await createWindowSpaceFromCurrentFloatingWindows();
    expect(createdWindowSpaceId).toBeNull();
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Failed to save window space (404): Not Found",
      NotificationTypeEnum.error,
    );
    expect(useProjectState.getState().projectConfig.windowSpaces).toEqual({});
  });
  it("uses the post-sync authoritative layout for both the saved window space and live workspace", async () => {
    const sectionState = buildChatSectionState("section-1", "section-thread");
    useProjectState.setState({
      ...sectionState,
      projectConfig: sectionState.projectConfig,
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-project", "floating-section"],
        instancesById: {
          "floating-project": {
            instanceId: "floating-project",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Workspace Chat",
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
          "floating-section": {
            instanceId: "floating-section",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            bounds: {
              x: 420,
              y: 120,
              width: 420,
              height: 320,
            },
          },
        },
      }),
    });
    routeSetProjectChatWindowingStateMock.mockResolvedValue(
      openAPISuccess(
        createProjectChatWindowingState({
          order: ["floating-project", "canvas-section"],
          instancesById: {
            "floating-project": {
              instanceId: "floating-project",
              placement: ChatWindowPlacementEnum.floating,
              mode: ChatWindowModeEnum.project_ai_mode,
              title: "Workspace Chat",
              bounds: {
                x: 120,
                y: 80,
                width: 500,
                height: 360,
              },
            },
            "canvas-section": {
              instanceId: "canvas-section",
              placement: ChatWindowPlacementEnum.canvas_section,
              mode: ChatWindowModeEnum.section_mode,
              sectionIdOrNull: "section-1",
            },
          },
        }),
      ),
    );
    routeCreateWindowSpaceMock.mockImplementation(async (request) =>
      buildCreatedWindowSpaceResponse(request.body),
    );
    await expect(createWindowSpaceFromCurrentFloatingWindows()).resolves.toBe(
      "window-space-1",
    );
    const createRequest = routeCreateWindowSpaceMock.mock.calls[0]?.[0];
    expect(createRequest?.body.state.order).toEqual(["floating-project"]);
    expect(
      useProjectState.getState().projectConfig.windowSpaces["window-space-1"]
        ?.order,
    ).toEqual(["floating-project"]);
    expect(useProjectState.getState().projectChatWindowing.order).toEqual([
      "floating-project",
      "canvas-section",
    ]);
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "floating-section"
      ],
    ).toBeUndefined();
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "canvas-section"
      ],
    ).toMatchObject({
      instanceId: "canvas-section",
      placement: ChatWindowPlacementEnum.canvas_section,
      sectionIdOrNull: "section-1",
    });
    expect(
      createRequest?.body.state.windowsById["floating-section"],
    ).toBeUndefined();
  });
  it("shows an error notification when syncing the workspace layout fails before saving", async () => {
    routeSetProjectChatWindowingStateMock.mockResolvedValue(
      openAPIError({ detail: "Not Found" }, 404),
    );
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["floating-chat"],
        instancesById: {
          "floating-chat": {
            instanceId: "floating-chat",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Research Chat",
            bounds: {
              x: 120,
              y: 80,
              width: 500,
              height: 360,
            },
          },
        },
      }),
    });
    const createdWindowSpaceId =
      await createWindowSpaceFromCurrentFloatingWindows();
    expect(createdWindowSpaceId).toBeNull();
    expect(routeCreateWindowSpaceMock).not.toHaveBeenCalled();
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Failed to sync window layout before saving (404): Not Found",
      NotificationTypeEnum.error,
    );
  });
});
