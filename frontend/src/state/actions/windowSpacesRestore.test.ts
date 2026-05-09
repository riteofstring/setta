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
  createVariant,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  focusProjectChatWindow,
  setProjectChatWindowBounds,
} from "./projectChatWindowing";
import {
  createProjectChatWindowingStateFromWindowSpace,
  restoreWindowSpaceInWorkspace,
  sortWindowSpaces,
} from "./windowSpaces";
import {
  installFocusedWindowRestoreState,
  projectChatWindow,
} from "./windowSpacesRestore.test.support";
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

function deferNextProjectChatWindowingStateWrite() {
  let resolveWrite:
    | ((value: ProjectChatWindowingOpenAPISuccess) => void)
    | null = null;
  routeSetProjectChatWindowingStateMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveWrite = resolve;
    }),
  );
  return (value: ProjectChatWindowingOpenAPISuccess) => {
    if (!resolveWrite) {
      throw new Error("Expected deferred project chat layout write.");
    }
    resolveWrite(value);
  };
}

function firstProjectChatWindowingStateRequest() {
  const request = routeSetProjectChatWindowingStateMock.mock.calls[0]?.[0];
  if (!request) {
    throw new Error("Expected the restore layout write to be queued.");
  }
  return request;
}

function expectProjectChatWindowAbove(instanceId: string, peerId: string) {
  expect(projectChatWindow(instanceId).zIndex).toBeGreaterThan(
    projectChatWindow(peerId).zIndex,
  );
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
describe("restoreWindowSpaceInWorkspace", () => {
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
  it("rehydrates saved window-space windows as floating workspace windows", () => {
    const nextWindowing = createProjectChatWindowingStateFromWindowSpace(
      {
        id: "space-1",
        name: "Focused Layout",
        sortIndex: 0,
        windowsById: {
          "project-chat-window-4": {
            surfaceKind: "project_chat",
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Research Chat",
            zIndex: 2,
            normalizedBounds: {
              x: 0.1,
              y: 0.2,
              width: 0.5,
              height: 0.4,
            },
          },
          "project-chat-window-8": {
            surfaceKind: "section",
            sectionIdOrNull: "section-1",
            mode: ChatWindowModeEnum.section_mode,
            zIndex: 5,
            normalizedBounds: {
              x: 0.6,
              y: 0.2,
              width: 0.3,
              height: 0.5,
            },
          },
          "stale-section-window": {
            surfaceKind: "section",
            sectionIdOrNull: "missing-section",
            mode: ChatWindowModeEnum.section_mode,
            zIndex: 7,
            normalizedBounds: {
              x: 0,
              y: 0,
              width: 0.25,
              height: 0.25,
            },
          },
        },
        order: [
          "project-chat-window-4",
          "project-chat-window-8",
          "stale-section-window",
        ],
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
    expect(nextWindowing.order).toEqual([
      "project-chat-window-4",
      "project-chat-window-8",
    ]);
    expect(nextWindowing.instancesById["project-chat-window-4"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Research Chat",
      zIndex: 2,
      bounds: {
        x: 180,
        y: 190,
        width: 400,
        height: 280,
      },
    });
    expect(nextWindowing.instancesById["project-chat-window-8"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      sectionIdOrNull: "section-1",
      zIndex: 5,
      bounds: {
        x: 580,
        y: 190,
        width: 240,
        height: 350,
      },
    });
    expect(nextWindowing.instancesById["stale-section-window"]).toBeUndefined();
    expect(nextWindowing.nextInstanceNumber).toBe(9);
  });
  it("does not restore saved per-window thread ids into workspace section-mode windows", async () => {
    const sectionState = buildChatSectionState("section-1", "workspace-thread");
    useProjectState.setState({
      ...sectionState,
      projectConfig: createProjectConfig({
        ...sectionState.projectConfig,
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "section",
                sectionIdOrNull: "section-1",
                mode: ChatWindowModeEnum.section_mode,
                chatId: "saved-section-thread",
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
          },
        },
      }),
      projectChatWindowing: createProjectChatWindowingState(),
    });
    await restoreWindowSpaceInWorkspace("space-1");
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-2"
      ],
    ).toMatchObject({
      mode: ChatWindowModeEnum.section_mode,
      sectionIdOrNull: "section-1",
      chatId: null,
    });
  });
  it("restores the saved floating layout while preserving unrelated live windows", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Research Chat",
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
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-99", "project-chat-window-88"],
        instancesById: {
          "project-chat-window-99": {
            instanceId: "project-chat-window-99",
            placement: ChatWindowPlacementEnum.bottom_docked,
            title: "Old Window",
          },
          "project-chat-window-88": {
            instanceId: "project-chat-window-88",
            placement: ChatWindowPlacementEnum.floating,
            title: "Transient Window",
            chatId: "chat-live-floating",
          },
        },
      }),
    });
    await restoreWindowSpaceInWorkspace("space-1");
    expect(useProjectState.getState().projectChatWindowing.order).toEqual([
      "project-chat-window-99",
      "project-chat-window-88",
      "project-chat-window-2",
    ]);
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-99"
      ],
    ).toMatchObject({
      placement: ChatWindowPlacementEnum.bottom_docked,
      title: "Old Window",
    });
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-2"
      ],
    ).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Research Chat",
      zIndex: 3,
    });
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "project-chat-window-88"
      ],
    ).toMatchObject({
      instanceId: "project-chat-window-88",
      placement: ChatWindowPlacementEnum.floating,
      title: "Transient Window",
      chatId: "chat-live-floating",
    });
    expect(routeSetProjectChatWindowingStateMock).toHaveBeenCalledTimes(1);
  });
  it("restores saved section-backed project-ai threads through the dedicated chat binding route", async () => {
    const sectionState = buildChatSectionState("section-1", "workspace-thread");
    useProjectState.setState({
      ...sectionState,
      projectConfig: createProjectConfig({
        ...sectionState.projectConfig,
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "section-window": {
                surfaceKind: "section",
                sectionIdOrNull: "section-1",
                mode: ChatWindowModeEnum.project_ai_mode,
                chatId: "saved-section-thread",
                zIndex: 5,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["section-window"],
          },
        },
      }),
      projectChatWindowing: createProjectChatWindowingState({
        order: ["section-window"],
        instancesById: {
          "section-window": {
            instanceId: "section-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            sectionIdOrNull: "section-1",
            chatId: "workspace-thread",
            zIndex: 2,
            bounds: {
              x: 520,
              y: 160,
              width: 280,
              height: 220,
            },
          },
        },
        nextInstanceNumber: 2,
      }),
    });
    await restoreWindowSpaceInWorkspace("space-1");
    expect(routeSetProjectChatWindowingStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          state: expect.objectContaining({
            instancesById: expect.objectContaining({
              "section-window": expect.objectContaining({
                chatId: "workspace-thread",
              }),
            }),
          }),
        }),
      }),
    );
    expect(routeSetProjectChatWindowChatIdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          instanceId: "section-window",
          chatId: "saved-section-thread",
        }),
      }),
    );
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "section-window"
      ]?.chatId,
    ).toBe("saved-section-thread");
  });
  it("reuses the live floating project-chat instance when the saved chat already exists under a different window id", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "saved-window": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Saved Chat",
                chatId: "chat-shared",
                zIndex: 4,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["saved-window"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["live-window"],
        instancesById: {
          "live-window": {
            instanceId: "live-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Live Chat",
            chatId: "chat-shared",
            zIndex: 1,
            bounds: {
              x: 500,
              y: 400,
              width: 240,
              height: 180,
            },
          },
        },
        nextInstanceNumber: 2,
      }),
    });
    await restoreWindowSpaceInWorkspace("space-1");
    expect(routeSetProjectChatWindowingStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          state: expect.objectContaining({
            instancesById: expect.objectContaining({
              "live-window": expect.objectContaining({
                title: "Saved Chat",
                chatId: "chat-shared",
              }),
            }),
          }),
        }),
      }),
    );
    expect(
      routeSetProjectChatWindowingStateMock.mock.calls[0]?.[0]?.body.state
        .instancesById["saved-window"],
    ).toBeUndefined();
    expect(routeSetProjectChatWindowChatIdMock).not.toHaveBeenCalled();
    const nextState = useProjectState.getState().projectChatWindowing;
    expect(nextState.order).toEqual(["live-window"]);
    expect(nextState.instancesById["live-window"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Saved Chat",
      chatId: "chat-shared",
    });
    expect(nextState.instancesById["saved-window"]).toBeUndefined();
  });
  it("reuses the live section-backed project-chat instance when the saved section chat has a different window id", async () => {
    const sectionState = buildChatSectionState("section-1", "workspace-thread");
    useProjectState.setState({
      ...sectionState,
      projectConfig: createProjectConfig({
        ...sectionState.projectConfig,
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "saved-section-window": {
                surfaceKind: "section",
                sectionIdOrNull: "section-1",
                mode: ChatWindowModeEnum.project_ai_mode,
                chatId: "saved-section-thread",
                zIndex: 5,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["saved-section-window"],
          },
        },
      }),
      projectChatWindowing: createProjectChatWindowingState({
        order: ["live-section-window"],
        instancesById: {
          "live-section-window": {
            instanceId: "live-section-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            sectionIdOrNull: "section-1",
            chatId: "workspace-thread",
            zIndex: 2,
            bounds: {
              x: 520,
              y: 160,
              width: 280,
              height: 220,
            },
          },
        },
        nextInstanceNumber: 2,
      }),
    });
    await restoreWindowSpaceInWorkspace("space-1");
    expect(routeSetProjectChatWindowingStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          state: expect.objectContaining({
            instancesById: expect.objectContaining({
              "live-section-window": expect.objectContaining({
                sectionIdOrNull: "section-1",
                chatId: "workspace-thread",
              }),
            }),
          }),
        }),
      }),
    );
    expect(
      routeSetProjectChatWindowingStateMock.mock.calls[0]?.[0]?.body.state
        .instancesById["saved-section-window"],
    ).toBeUndefined();
    expect(routeSetProjectChatWindowChatIdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          instanceId: "live-section-window",
          chatId: "saved-section-thread",
        }),
      }),
    );
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "live-section-window"
      ]?.chatId,
    ).toBe("saved-section-thread");
  });
  it("reuses the live section-backed project-chat instance before the first thread exists", async () => {
    const sectionState = buildChatSectionState("section-1");
    const windowSpace = {
      id: "space-1",
      name: "Focused Layout",
      sortIndex: 0,
      windowsById: {
        "saved-section-window": {
          surfaceKind: "section",
          sectionIdOrNull: "section-1",
          mode: ChatWindowModeEnum.project_ai_mode,
          chatId: null,
          zIndex: 5,
          normalizedBounds: {
            x: 0.1,
            y: 0.15,
            width: 0.45,
            height: 0.5,
          },
        },
      },
      order: ["saved-section-window"],
    };
    const expectedRestoredWindow =
      createProjectChatWindowingStateFromWindowSpace(windowSpace, {
        sections: sectionState.sections,
      }).instancesById["saved-section-window"];
    if (!expectedRestoredWindow) {
      throw new Error("Expected restored section window snapshot.");
    }
    useProjectState.setState({
      ...sectionState,
      projectConfig: createProjectConfig({
        ...sectionState.projectConfig,
        windowSpaces: {
          "space-1": windowSpace,
        },
      }),
      projectChatWindowing: createProjectChatWindowingState({
        order: ["live-section-window"],
        instancesById: {
          "live-section-window": {
            instanceId: "live-section-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            sectionIdOrNull: "section-1",
            chatId: null,
            zIndex: 2,
            bounds: {
              x: 520,
              y: 160,
              width: 280,
              height: 220,
            },
          },
        },
        nextInstanceNumber: 2,
      }),
    });
    await restoreWindowSpaceInWorkspace("space-1");
    expect(routeSetProjectChatWindowChatIdMock).not.toHaveBeenCalled();
    const nextState = useProjectState.getState().projectChatWindowing;
    expect(nextState.order).toEqual(["live-section-window"]);
    expect(nextState.instancesById["saved-section-window"]).toBeUndefined();
    expect(nextState.instancesById["live-section-window"]).toMatchObject({
      instanceId: "live-section-window",
      placement: ChatWindowPlacementEnum.floating,
      mode: ChatWindowModeEnum.project_ai_mode,
      sectionIdOrNull: "section-1",
      chatId: null,
      zIndex: expectedRestoredWindow.zIndex,
      bounds: expectedRestoredWindow.bounds,
    });
  });
  it("does not start thread rebinding when the restore layout write is rejected", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "saved-window": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Saved Chat",
                chatId: "chat-restored",
                zIndex: 4,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["saved-window"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState(),
    });
    routeSetProjectChatWindowingStateMock.mockResolvedValue(
      openAPIError({ detail: "synthetic restore failure" }, 500),
    );
    await restoreWindowSpaceInWorkspace("space-1");
    expect(routeSetProjectChatWindowChatIdMock).not.toHaveBeenCalled();
    expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
      "Failed to restore saved chat threads.",
      NotificationTypeEnum.error,
    );
  });
  it("restores saved project-chat threads even if the user focuses the restored window before layout sync settles", async () => {
    const resolveLayoutWrite = deferNextProjectChatWindowingStateWrite();
    installFocusedWindowRestoreState();
    const restorePromise = restoreWindowSpaceInWorkspace("space-1");
    focusProjectChatWindow("project-chat-window-3", 1234);
    await flushOptimisticMutation();
    expectProjectChatWindowAbove(
      "project-chat-window-3",
      "project-chat-window-2",
    );
    expect(routeSetProjectChatWindowChatIdMock).not.toHaveBeenCalled();
    const firstLayoutRequest = firstProjectChatWindowingStateRequest();
    resolveLayoutWrite(openAPISuccess(firstLayoutRequest.body.state));
    await restorePromise;
    await flushOptimisticMutation();
    expect(routeSetProjectChatWindowChatIdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          instanceId: "project-chat-window-3",
          chatId: "chat-restored",
        }),
      }),
    );
    expect(projectChatWindow("project-chat-window-3")).toMatchObject({
      chatId: "chat-restored",
      lastFocusedAt: 1234,
    });
    expectProjectChatWindowAbove(
      "project-chat-window-3",
      "project-chat-window-2",
    );
  });
  it("keeps newer bounds and focus when the saved thread binding resolves after more user interaction", async () => {
    let resolveThreadBinding:
      | ((value: ProjectChatWindowingOpenAPISuccess) => void)
      | null = null;
    routeSetProjectChatWindowChatIdMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveThreadBinding = resolve;
        }),
    );
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "saved-window": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Saved Chat",
                chatId: "chat-restored",
                zIndex: 4,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["saved-window"],
          },
        },
      }),
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      projectChatWindowing: createProjectChatWindowingState(),
    });
    const restorePromise = restoreWindowSpaceInWorkspace("space-1");
    await flushOptimisticMutation();
    expect(routeSetProjectChatWindowChatIdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          instanceId: "saved-window",
          chatId: "chat-restored",
        }),
      }),
    );
    focusProjectChatWindow("saved-window", 4321);
    setProjectChatWindowBounds("saved-window", {
      x: 300,
      y: 220,
      width: 540,
      height: 380,
    });
    await flushOptimisticMutation();
    const pendingBindingRequest =
      routeSetProjectChatWindowChatIdMock.mock.calls[0]?.[0];
    if (!pendingBindingRequest) {
      throw new Error("Expected the saved thread binding request.");
    }
    const reboundWindowing = useProjectState.getState().projectChatWindowing;
    const reboundWindow = reboundWindowing.instancesById["saved-window"];
    if (!reboundWindow) {
      throw new Error("Expected the restored window before thread binding.");
    }
    resolveThreadBinding?.(
      openAPISuccess(
        createProjectChatWindowingState({
          ...reboundWindowing,
          instancesById: {
            ...reboundWindowing.instancesById,
            "saved-window": {
              ...reboundWindow,
              chatId: pendingBindingRequest.body.chatId,
            },
          },
        }),
      ),
    );
    await restorePromise;
    await flushOptimisticMutation();
    expect(
      useProjectState.getState().projectChatWindowing.instancesById[
        "saved-window"
      ],
    ).toMatchObject({
      chatId: "chat-restored",
      lastFocusedAt: 4321,
      bounds: {
        x: 300,
        y: 220,
        width: 540,
        height: 380,
      },
    });
  });
  it("remaps restored window ids when a saved floating window collides with an existing non-floating workspace window", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Restored Chat",
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
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-2"],
        instancesById: {
          "project-chat-window-2": {
            instanceId: "project-chat-window-2",
            placement: ChatWindowPlacementEnum.bottom_docked,
            title: "Docked Chat",
            chatId: "chat-live",
          },
        },
        nextInstanceNumber: 3,
      }),
    });
    await restoreWindowSpaceInWorkspace("space-1");
    const nextState = useProjectState.getState().projectChatWindowing;
    expect(nextState.order[0]).toBe("project-chat-window-2");
    expect(nextState.instancesById["project-chat-window-2"]).toMatchObject({
      placement: ChatWindowPlacementEnum.bottom_docked,
      title: "Docked Chat",
      chatId: "chat-live",
    });
    expect(nextState.instancesById["project-chat-window-3"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Restored Chat",
      chatId: "chat-restored",
    });
    expect(nextState.order).toEqual([
      "project-chat-window-2",
      "project-chat-window-3",
    ]);
    expect(nextState.nextInstanceNumber).toBe(4);
  });
  it("restores saved floating windows in place when they own the same project chat thread", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Saved Chat",
                chatId: "chat-saved",
                zIndex: 4,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-2"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-2"],
        instancesById: {
          "project-chat-window-2": {
            instanceId: "project-chat-window-2",
            placement: ChatWindowPlacementEnum.floating,
            title: "Moved Chat",
            chatId: "chat-saved",
            zIndex: 1,
            bounds: {
              x: 500,
              y: 400,
              width: 240,
              height: 180,
            },
          },
        },
        nextInstanceNumber: 3,
      }),
    });
    await restoreWindowSpaceInWorkspace("space-1");
    const nextState = useProjectState.getState().projectChatWindowing;
    expect(nextState.order).toEqual(["project-chat-window-2"]);
    expect(nextState.instancesById["project-chat-window-2"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Saved Chat",
      chatId: "chat-saved",
      zIndex: 4,
    });
    expect(
      nextState.instancesById["project-chat-window-2"]?.bounds,
    ).not.toEqual({
      x: 500,
      y: 400,
      width: 240,
      height: 180,
    });
    expect(nextState.instancesById["project-chat-window-3"]).toBeUndefined();
    expect(nextState.nextInstanceNumber).toBe(3);
  });
  it("remaps a saved blank project chat when its raw instance id collides with a live blank window", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Saved Blank Chat",
                chatId: null,
                zIndex: 4,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-2"],
          },
        },
      }),
      sections: {},
      sectionVariants: {},
      sectionImpls: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-2"],
        instancesById: {
          "project-chat-window-2": {
            instanceId: "project-chat-window-2",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Live Blank Chat",
            chatId: null,
            zIndex: 1,
            bounds: {
              x: 500,
              y: 400,
              width: 240,
              height: 180,
            },
          },
        },
        nextInstanceNumber: 3,
      }),
    });
    await restoreWindowSpaceInWorkspace("space-1");
    const nextState = useProjectState.getState().projectChatWindowing;
    expect(nextState.order).toEqual([
      "project-chat-window-2",
      "project-chat-window-3",
    ]);
    expect(nextState.instancesById["project-chat-window-2"]).toMatchObject({
      title: "Live Blank Chat",
      chatId: null,
      placement: ChatWindowPlacementEnum.floating,
      bounds: {
        x: 500,
        y: 400,
        width: 240,
        height: 180,
      },
    });
    expect(nextState.instancesById["project-chat-window-3"]).toMatchObject({
      title: "Saved Blank Chat",
      chatId: null,
      placement: ChatWindowPlacementEnum.floating,
    });
    expect(nextState.nextInstanceNumber).toBe(4);
  });
  it("remaps restored floating windows when the same instance id belongs to a different live owner", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Saved Chat",
                chatId: "chat-saved",
                zIndex: 4,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-2"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-2"],
        instancesById: {
          "project-chat-window-2": {
            instanceId: "project-chat-window-2",
            placement: ChatWindowPlacementEnum.floating,
            title: "Live Chat",
            chatId: "chat-live",
            zIndex: 1,
            bounds: {
              x: 500,
              y: 400,
              width: 240,
              height: 180,
            },
          },
        },
        nextInstanceNumber: 3,
      }),
    });
    await restoreWindowSpaceInWorkspace("space-1");
    const nextState = useProjectState.getState().projectChatWindowing;
    expect(nextState.order).toEqual([
      "project-chat-window-2",
      "project-chat-window-3",
    ]);
    expect(nextState.instancesById["project-chat-window-2"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Live Chat",
      chatId: "chat-live",
      bounds: {
        x: 500,
        y: 400,
        width: 240,
        height: 180,
      },
    });
    expect(nextState.instancesById["project-chat-window-3"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Saved Chat",
      chatId: "chat-saved",
    });
    expect(nextState.nextInstanceNumber).toBe(4);
  });
  it("replaces an existing floating section host when the restored layout owns the same section", () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "restored-section-window": {
                surfaceKind: "section",
                sectionIdOrNull: "section-1",
                mode: ChatWindowModeEnum.section_mode,
                title: null,
                chatId: "chat-saved-section",
                zIndex: 4,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["restored-section-window"],
          },
        },
      }),
      sections: {
        "section-1": createCore({
          id: "section-1",
          name: "Research Notes",
        }),
      },
      projectChatWindowing: createProjectChatWindowingState({
        order: ["live-section-window", "unrelated-floating-window"],
        instancesById: {
          "live-section-window": {
            instanceId: "live-section-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            title: "Live Section Chat",
            chatId: "chat-live-section",
          },
          "unrelated-floating-window": {
            instanceId: "unrelated-floating-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Unrelated Floating Chat",
            chatId: "chat-unrelated",
          },
        },
        nextInstanceNumber: 2,
      }),
    });
    restoreWindowSpaceInWorkspace("space-1");
    const nextState = useProjectState.getState().projectChatWindowing;
    expect(nextState.instancesById["live-section-window"]).toBeUndefined();
    expect(nextState.instancesById["restored-section-window"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      sectionIdOrNull: "section-1",
      chatId: null,
    });
    expect(nextState.instancesById["unrelated-floating-window"]).toMatchObject({
      placement: ChatWindowPlacementEnum.floating,
      title: "Unrelated Floating Chat",
      chatId: "chat-unrelated",
    });
    expect(nextState.order).toEqual([
      "unrelated-floating-window",
      "restored-section-window",
    ]);
  });
  it("preserves an existing non-floating section host when a saved floating section chat collides with it", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Focused Layout",
            sortIndex: 0,
            windowsById: {
              "restored-section-window": {
                surfaceKind: "section",
                sectionIdOrNull: "section-1",
                mode: ChatWindowModeEnum.section_mode,
                title: "Saved Section Chat",
                zIndex: 4,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["restored-section-window"],
          },
        },
      }),
      sections: {
        "section-1": createCore({
          id: "section-1",
          name: "Research Notes",
        }),
      },
      projectChatWindowing: createProjectChatWindowingState({
        order: ["canvas-section-window"],
        instancesById: {
          "canvas-section-window": {
            instanceId: "canvas-section-window",
            placement: ChatWindowPlacementEnum.canvas_section,
            mode: ChatWindowModeEnum.section_mode,
            sectionIdOrNull: "section-1",
            title: "Canvas Section Chat",
          },
        },
        nextInstanceNumber: 2,
      }),
    });
    await restoreWindowSpaceInWorkspace("space-1");
    const nextState = useProjectState.getState().projectChatWindowing;
    const sectionInstances = Object.values(nextState.instancesById).filter(
      (instance) => instance.sectionIdOrNull === "section-1",
    );
    expect(sectionInstances).toHaveLength(1);
    expect(sectionInstances[0]).toMatchObject({
      instanceId: "canvas-section-window",
      placement: ChatWindowPlacementEnum.canvas_section,
      title: "Canvas Section Chat",
    });
    expect(nextState.instancesById["restored-section-window"]).toBeUndefined();
    expect(nextState.order).toEqual(["canvas-section-window"]);
  });
  it("restores persisted embedded git-pane visibility when restoring a saved workspace layout", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Git Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.git_graph_mode,
                title: "Git Graph",
                embeddedGitPaneVisible: true,
                zIndex: 2,
                normalizedBounds: {
                  x: 0.0,
                  y: 0.0,
                  width: 0.4,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-2"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState(),
    });
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-id",
          "stale-window",
        )]: true,
      },
    });
    await restoreWindowSpaceInWorkspace("space-1");
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({
      [buildProjectChatEphemeralWindowInstanceKey(
        "project-id",
        "project-chat-window-2",
      )]: true,
    });
    expect(useProjectState.getState().projectChatWindowing.order).toEqual([
      "project-chat-window-2",
    ]);
  });
  it("rolls back git-pane visibility together with the workspace restore when the write is rejected", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Git Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-1": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.git_graph_mode,
                title: "Saved Git Graph",
                embeddedGitPaneVisible: true,
                zIndex: 3,
                normalizedBounds: {
                  x: 0.2,
                  y: 0.1,
                  width: 0.4,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-1"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.git_graph_mode,
            title: "Live Git Graph",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 1,
            bounds: {
              x: 600,
              y: 120,
              width: 320,
              height: 280,
            },
          },
        },
      }),
    });
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {},
    });
    routeSetProjectChatWindowingStateMock.mockResolvedValue(
      openAPIError({ detail: "synthetic failure" }, 500),
    );
    const previousWindowing = structuredClone(
      useProjectState.getState().projectChatWindowing,
    );
    const previousVisibility = structuredClone(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    );
    await restoreWindowSpaceInWorkspace("space-1");
    expect(useProjectState.getState().projectChatWindowing).toEqual(
      previousWindowing,
    );
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual(previousVisibility);
  });
  it("preserves foreign-project git-pane visibility when restoring a workspace layout", async () => {
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Git Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-2": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.git_graph_mode,
                title: "Saved Git Graph",
                embeddedGitPaneVisible: true,
                zIndex: 2,
                normalizedBounds: {
                  x: 0.0,
                  y: 0.0,
                  width: 0.4,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-2"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState(),
    });
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "foreign-project",
          "foreign-window",
        )]: true,
      },
    });
    await restoreWindowSpaceInWorkspace("space-1");
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual({
      [buildProjectChatEphemeralWindowInstanceKey(
        "foreign-project",
        "foreign-window",
      )]: true,
      [buildProjectChatEphemeralWindowInstanceKey(
        "project-id",
        "project-chat-window-2",
      )]: true,
    });
  });
  it("is a strict no-op when deployment policy disallows restore-side layout changes", async () => {
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-1",
      sessionRunCount: 0,
      sharePolicy: {
        allowLLM: true,
        allowLayoutChanges: false,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
      deploymentMode: "share",
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        windowSpaces: {
          "space-1": {
            id: "space-1",
            name: "Git Layout",
            sortIndex: 0,
            windowsById: {
              "project-chat-window-1": {
                surfaceKind: "project_chat",
                mode: ChatWindowModeEnum.git_graph_mode,
                title: "Saved Git Graph",
                embeddedGitPaneVisible: true,
                zIndex: 3,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.1,
                  width: 0.4,
                  height: 0.5,
                },
              },
            },
            order: ["project-chat-window-1"],
          },
        },
      }),
      sections: {},
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.git_graph_mode,
            title: "Live Git Graph",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 1,
            bounds: {
              x: 500,
              y: 140,
              width: 320,
              height: 260,
            },
          },
        },
      }),
    });
    useMisc.setState({
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {
        [buildProjectChatEphemeralWindowInstanceKey(
          "project-id",
          "project-chat-window-1",
        )]: true,
      },
    });
    const previousWindowing = structuredClone(
      useProjectState.getState().projectChatWindowing,
    );
    const previousVisibility = structuredClone(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    );
    await restoreWindowSpaceInWorkspace("space-1");
    expect(routeSetProjectChatWindowingStateMock).not.toHaveBeenCalled();
    expect(useProjectState.getState().projectChatWindowing).toEqual(
      previousWindowing,
    );
    expect(
      useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    ).toEqual(previousVisibility);
  });
});
