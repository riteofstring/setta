import {
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
  createVariant,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  focusProjectChatWindow,
  replaceProjectChatWindowingState,
  setProjectChatWindowBounds,
} from "./projectChatWindowing";
import {
  createWindowSpaceFromCurrentFloatingWindows,
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
